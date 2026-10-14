"""Replicate adapter (backup).

Documented flow: POST https://api.replicate.com/v1/models/<owner>/<name>/predictions with
`Authorization: Bearer <REPLICATE_API_TOKEN>` and {"input": {...}} -> {id, status, urls.get};
GET urls.get until status is succeeded | failed | canceled; `output` is a URL or a list of URLs.
Replicate deletes API outputs after an hour, so images are downloaded immediately.

Input field names follow each model's public page. Tested against scripted fakes only,
not live-verified. Override through config `extra`.
"""
from ..errors import ProviderError
from .base import GenRequest, GenResult, Provider, Route, data_uri, normalize_png, prepare_ref

API = "https://api.replicate.com/v1/"

DEFAULTS = {
    "t2i_model": "black-forest-labs/flux-dev",
    "edit_models": [
        {"model": "black-forest-labs/flux-kontext-dev", "max_refs": 1},
        {"model": "qwen/qwen-image-edit-plus", "max_refs": 3},
    ],
    "usd_per_image": 0.025,
    "extra": {},
}


class ReplicateProvider(Provider):
    name = "replicate"
    secret_env = "REPLICATE_API_TOKEN"

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.cfg = {**DEFAULTS, **self.config}

    def routes(self):
        rs = [Route(self.cfg["t2i_model"], "t2i", 0)]
        rs += [Route(e["model"], "edit", e["max_refs"]) for e in self.cfg["edit_models"]]
        return rs

    def estimate_usd(self, route, width, height):
        return self.cfg["usd_per_image"]

    def _headers(self):
        return {"Authorization": f"Bearer {self.key()}", "Content-Type": "application/json"}

    def build_input(self, req, route):
        inp = {"prompt": req.prompt, "seed": req.seed, "aspect_ratio": "4:5", "output_format": "png"}
        if route.mode == "edit":
            if route.model.endswith("flux-kontext-dev"):
                inp["input_image"] = data_uri(prepare_ref(req.refs[0]))
            else:
                inp["image"] = [data_uri(prepare_ref(r)) for r in req.refs]
        inp.update(self.cfg["extra"].get(route.model, {}))
        return inp

    def _run(self, model, inp, on_handle, resume):
        h = self._headers()
        if resume:
            handle = resume
        else:
            sub = self.http.post_json(f"{API}models/{model}/predictions", h, {"input": inp})
            if "id" not in sub:
                raise ProviderError(f"replicate submit gave no id: {str(sub)[:200]}")
            handle = {"request_id": sub["id"], "status_url": sub["urls"]["get"]}
            if on_handle:
                on_handle(handle)

        def check():
            p = self.http.get_json(handle["status_url"], h)
            s = p.get("status")
            if s == "succeeded":
                return p
            if s in ("failed", "canceled"):
                raise ProviderError(f"replicate prediction {handle['request_id']} {s}: {str(p.get('error'))[:200]}")
            return None

        return handle, self.wait(check)

    def generate(self, req, route, on_handle=None, resume=None):
        handle, pred = self._run(route.model, self.build_input(req, route), on_handle, resume)
        out = pred.get("output")
        urls = [out] if isinstance(out, str) else list(out or [])
        if not urls:
            raise ProviderError("replicate output was empty")
        return GenResult([normalize_png(self.http.get_bytes(u)) for u in urls], handle["request_id"], route.model)
