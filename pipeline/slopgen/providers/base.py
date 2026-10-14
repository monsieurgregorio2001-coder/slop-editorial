"""Provider interface.

A provider turns one GenRequest (prompt, size, seed, reference images) into image bytes.
Adapters hold every provider-specific detail (URLs, model ids, parameter names, prices)
in one place so a changed API means editing one file or one config override.

Paid-request rules, shared by every adapter:
  * The provider's request id is handed to `on_handle` the moment it exists, so a crash
    never loses a job that is already being billed. Resuming polls that id.
  * POST is never retried. An unclear POST outcome raises AmbiguousSubmit.
  * No adapter loops on failure. One request, one poll loop, then an error.
"""
import io
import time
from dataclasses import dataclass, field

from PIL import Image

from ..errors import ProviderError


@dataclass
class GenRequest:
    prompt: str
    width: int
    height: int
    seed: int
    refs: list = field(default_factory=list)   # PNG/JPEG bytes, identity reference first


@dataclass
class Route:
    model: str
    mode: str          # "t2i" | "edit"
    max_refs: int


@dataclass
class GenResult:
    images: list       # bytes
    request_id: str = ""
    model: str = ""
    notes: list = field(default_factory=list)   # e.g. "candidate withheld by provider safety filter"


class Provider:
    name = "base"
    secret_env = None          # name of the env var / secret store entry holding the key
    price_note = ""

    def __init__(self, http=None, config=None, sleep=time.sleep):
        self.http = http
        self.config = config or {}
        self.sleep = sleep
        self.poll_interval = self.config.get("poll_interval", 3)
        self.poll_timeout = self.config.get("poll_timeout", 600)

    # ---- routing -------------------------------------------------------------
    def routes(self):
        """List of Route, edit routes ordered by ascending max_refs."""
        raise NotImplementedError

    def route_for(self, n_refs: int) -> Route:
        rs = self.routes()
        if n_refs == 0:
            for r in rs:
                if r.mode == "t2i":
                    return r
            raise ProviderError(f"{self.name} has no text-to-image route")
        edits = sorted((r for r in rs if r.mode == "edit"), key=lambda r: r.max_refs)
        if not edits:
            raise ProviderError(f"{self.name} has no reference-image route")
        for r in edits:
            if r.max_refs >= n_refs:
                return r
        return edits[-1]   # more refs than any route takes: caller truncates

    def pick_refs(self, refs: list, route: Route):
        """Keep the identity reference (index 0) plus the newest frames when over the limit.
        Returns (kept indices, dropped indices)."""
        n = len(refs)
        if n <= route.max_refs:
            return list(range(n)), []
        if route.max_refs <= 1:
            kept = [n - 1] if n else []
        else:
            kept = [0] + list(range(n - (route.max_refs - 1), n))
        return kept, [i for i in range(n) if i not in kept]

    def estimate_usd(self, route: Route, width: int, height: int) -> float:
        raise NotImplementedError

    # ---- generation ----------------------------------------------------------
    def generate(self, req: GenRequest, route: Route, on_handle=None, resume=None) -> GenResult:
        raise NotImplementedError

    def key(self):
        from ..secrets import get_secret
        return get_secret(self.secret_env)

    # ---- helpers -------------------------------------------------------------
    def wait(self, check):
        """Call check() until it returns not-None, sleeping between calls; bounded by poll_timeout."""
        waited = 0
        while True:
            out = check()
            if out is not None:
                return out
            if waited >= self.poll_timeout:
                raise ProviderError(f"{self.name}: timed out after {self.poll_timeout}s (job may still finish; resume with the same run)")
            self.sleep(self.poll_interval)
            waited += self.poll_interval


def prepare_ref(data: bytes, max_side=1536) -> bytes:
    """Downscale a reference to keep request bodies small; JPEG q92."""
    im = Image.open(io.BytesIO(data)).convert("RGB")
    im.thumbnail((max_side, max_side))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=92)
    return out.getvalue()


def normalize_png(data: bytes) -> bytes:
    """Re-encode whatever came back as PNG so files and hashes are uniform."""
    im = Image.open(io.BytesIO(data))
    im.load()
    out = io.BytesIO()
    im.convert("RGB").save(out, "PNG")
    return out.getvalue()


def data_uri(jpeg: bytes) -> str:
    import base64
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
