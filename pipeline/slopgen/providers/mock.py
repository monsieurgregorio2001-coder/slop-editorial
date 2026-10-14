"""Offline stand-in. Draws deterministic coloured frames so the whole pipeline, review sheet and
deck can be exercised without a key or network. Output is obviously a placeholder and carries
no photographic content. Free, so no cost gate and no GO reference needed."""
import hashlib
import io

from PIL import Image, ImageDraw

from .base import GenResult, Provider, Route


class MockProvider(Provider):
    name = "mock"
    secret_env = None
    free = True

    def routes(self):
        return [Route("mock-t2i", "t2i", 0), Route("mock-edit", "edit", 8)]

    def estimate_usd(self, route, width, height):
        return 0.0

    def generate(self, req, route, on_handle=None, resume=None):
        digest = hashlib.sha256((req.prompt + str(req.seed) + str(len(req.refs))).encode()).digest()
        base = (40 + digest[0] % 120, 30 + digest[1] % 60, 30 + digest[2] % 80)
        im = Image.new("RGB", (req.width, req.height), base)
        d = ImageDraw.Draw(im)
        for i in range(8):
            x = digest[3 + i] / 255 * req.width
            y = digest[11 + i] / 255 * req.height
            r = 60 + digest[19 + i] % 140
            d.ellipse([x - r, y - r, x + r, y + r], outline=(35, 64, 184), width=4)
        d.rectangle([0, 0, req.width - 1, req.height - 1], outline=(250, 248, 244), width=6)
        out = io.BytesIO()
        im.save(out, "PNG")
        if on_handle:
            on_handle({"request_id": "mock-" + digest.hex()[:8]})
        return GenResult([out.getvalue()], "mock-" + digest.hex()[:8], route.model, ["MOCK placeholder image"])
