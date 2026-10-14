"""fal.ai adapter: queue API.

Documented flow (fal queue): POST https://queue.fal.run/<model> with `Authorization: Key <FAL_KEY>`
-> {request_id, status_url, response_url}; GET status_url until status == COMPLETED; GET response_url.
Images accept data URIs, so no separate upload step is needed.

Parameter names follow fal's public model pages. They are tested against scripted fakes only and
are NOT live-verified: run one small `slopgen run --only P1` with a real key first, and override
any changed name in config `extra` rather than editing code.
"""
import math
import os

from ..errors import ProviderError
from .base import GenRequest, GenResult, Provider, Route, data_uri, normalize_png, prepare_ref

QUEUE = "https://queue.fal.run/"

DEFAULTS = {
    "t2i_model": "fal-ai/flux/dev",
    "edit_models": [
        {"model": "fal-ai/flux-kontext/dev", "max_refs": 1},
        {"model": "fal-ai/qwen-image-edit-plus", "max_refs": 3},
    ],
    # USD per megapixel (images). Planning figures only, not invoices.
    "usd_per_mp": 0.03,
    # Kontext dev bills per whole megapixel per image.
    "kontext_usd_per_mp": 0.025,
    # Flat USD per image for the pro editing models (planning figures).
    "flat_usd_per_image": {"fal-ai/flux-pro/kontext": 0.04, "fal-ai/flux-pro/kontext/max": 0.08},
    "extra": {},   # per-model parameter overrides: {"fal-ai/flux-kontext/dev": {"resolution_mode": "4:5"}}
}


class FalProvider(Provider):
    name = "fal"
    secret_env = "FAL_KEY"

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.cfg = {**DEFAULTS, **self.config}
        forced = os.environ.get("SLOPGEN_FAL_EDIT_MODEL", "").strip()   # e.g. fal-ai/flux-pro/kontext/max
        if forced:
            if forced not in self.cfg["flat_usd_per_image"]:
                raise ProviderError(f"SLOPGEN_FAL_EDIT_MODEL must be one of {sorted(self.cfg['flat_usd_per_image'])}")
            self.cfg["edit_models"] = [{"model": forced, "max_refs": 1}]

    def routes(self):
        rs = [Route(self.cfg["t2i_model"], "t2i", 0)]
        rs += [Route(e["model"], "edit", e["max_refs"]) for e in self.cfg["edit_models"]]
        return rs

    def estimate_usd(self, route, width, height):
        if route.model in self.cfg["flat_usd_per_image"]:
            return self.cfg["flat_usd_per_image"][route.model]
        if route.model == "fal-ai/flux-kontext/dev":
            return round(math.ceil(width * height / 1e6) * self.cfg["kontext_usd_per_mp"], 4)
        return round(width * height / 1e6 * self.cfg["usd_per_mp"], 4)

    def _headers(self):
        return {"Authorization": f"Key {self.key()}", "Content-Type": "application/json"}

    def build_body(self, req: GenRequest, route: Route) -> dict:
        size = {"width": req.width, "height": req.height}
        body = {"prompt": req.prompt, "seed": req.seed, "num_images": 1, "output_format": "png"}
        if route.mode == "t2i":
            body["image_size"] = size
        elif route.model.endswith("flux-kontext/dev"):
            body["image_url"] = data_uri(prepare_ref(req.refs[0]))
            body["resolution_mode"] = "4:5"   # public endpoint schema verified 8 Oct; actual pixels checked after generation
        elif route.model in self.cfg["flat_usd_per_image"]:   # Kontext pro / max: singular image_url, no 4:5 value
            body["image_url"] = data_uri(prepare_ref(req.refs[0]))
            body["aspect_ratio"] = "3:4"
        else:  # qwen-image-edit-plus and other multi-image editors
            body["image_urls"] = [data_uri(prepare_ref(r)) for r in req.refs]
            body["image_size"] = size
        body.update(self.cfg["extra"].get(route.model, {}))
        return body

    def generate(self, req, route, on_handle=None, resume=None):
        h = self._headers()
        if resume:
            handle = resume
        else:
            sub = self.http.post_json(QUEUE + route.model, h, self.build_body(req, route))
            if "request_id" not in sub:
                raise ProviderError(f"fal submit gave no request_id: {str(sub)[:200]}")
            handle = {"request_id": sub["request_id"], "status_url": sub["status_url"], "response_url": sub["response_url"]}
            if on_handle:
                on_handle(handle)

        def check():
            st = self.http.get_json(handle["status_url"], h)
            s = st.get("status")
            if s == "COMPLETED":
                return True
            if s in ("FAILED", "ERROR", "CANCELLED"):
                raise ProviderError(f"fal job {handle['request_id']} {s}: {str(st)[:200]}")
            return None

        self.wait(check)
        result = self.http.get_json(handle["response_url"], h)
        flags = result.get("has_nsfw_concepts") or []
        images, notes = [], []
        for i, img in enumerate(result.get("images") or []):
            if i < len(flags) and flags[i]:
                notes.append("candidate withheld: provider safety filter flagged it (not retried, not bypassed)")
                continue
            images.append(normalize_png(self.http.get_bytes(img["url"])))
        if not images and not notes:
            raise ProviderError(f"fal result had no images: {str(result)[:200]}")
        return GenResult(images, handle["request_id"], route.model, notes)
