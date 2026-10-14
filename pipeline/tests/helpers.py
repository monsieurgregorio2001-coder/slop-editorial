import io
from pathlib import Path

from PIL import Image

PKG = Path(__file__).resolve().parent.parent
PLAN = PKG / "plans" / "ai-and-taste.yaml"
ROOT = PKG


def png(color=(120, 20, 30), size=(64, 80)):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "PNG")
    return out.getvalue()


class FakeHttp:
    """Scripted stand-in for vgen.http.Http. `routes` maps (method, url-substring) to a list of
    responses consumed in order (the last one repeats)."""

    def __init__(self, routes=None):
        self.routes = routes or {}
        self.calls = []

    def _next(self, method, url):
        for (m, frag), seq in self.routes.items():
            if m == method and frag in url:
                item = seq[0] if len(seq) == 1 else seq.pop(0)
                if isinstance(item, Exception):
                    raise item
                return item
        raise AssertionError(f"unscripted {method} {url}")

    def post_json(self, url, headers, body):
        self.calls.append(("POST", url, headers, body))
        return self._next("POST", url)

    def post_raw(self, url, headers, body):
        self.calls.append(("POST", url, headers, body))
        return self._next("POST", url)

    def get_json(self, url, headers=None):
        self.calls.append(("GET", url, headers, None))
        return self._next("GET", url)

    def get_bytes(self, url, headers=None):
        self.calls.append(("GET", url, headers, None))
        return self._next("GET", url)

    def posts(self):
        return [c for c in self.calls if c[0] == "POST"]
