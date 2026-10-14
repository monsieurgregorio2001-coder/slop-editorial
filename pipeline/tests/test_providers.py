import unittest

from slopgen.errors import AmbiguousSubmit, ProviderError
from slopgen.providers.base import GenRequest
from slopgen.providers.fal import FalProvider
from slopgen.providers.replicate import ReplicateProvider
from .helpers import FakeHttp, png

IMG = png()
REQ = lambda n: GenRequest("a prompt", 1024, 1280, 7, [png((i, i, i)) for i in range(n)])


def fal_http(statuses=("IN_QUEUE", "COMPLETED"), result=None):
    return FakeHttp({
        ("POST", "queue.fal.run"): [{"request_id": "r1", "status_url": "https://q/s", "response_url": "https://q/r"}],
        ("GET", "https://q/s"): [{"status": s} for s in statuses],
        ("GET", "https://q/r"): [result or {"images": [{"url": "https://cdn/i.png"}], "seed": 7}],
        ("GET", "https://cdn/"): [IMG],
    })


class FalTests(unittest.TestCase):
    def setUp(self):
        import os
        os.environ["FAL_KEY"] = "SECRETKEYVALUE"
        self.addCleanup(os.environ.pop, "FAL_KEY", None)

    def mk(self, http):
        return FalProvider(http=http, sleep=lambda s: None)

    def test_routing(self):
        p = self.mk(None)
        self.assertEqual(p.route_for(0).model, "fal-ai/flux/dev")
        self.assertEqual(p.route_for(1).model, "fal-ai/flux-kontext/dev")
        self.assertEqual(p.route_for(2).model, "fal-ai/qwen-image-edit-plus")
        self.assertEqual(p.route_for(5).max_refs, 3)

    def test_over_limit_keeps_identity_and_newest(self):
        p = self.mk(None)
        kept, dropped = p.pick_refs(list("abcde"), p.route_for(5))
        self.assertEqual(kept, [0, 3, 4])
        self.assertEqual(dropped, [1, 2])

    def test_t2i_roundtrip_and_auth_header(self):
        http = fal_http()
        p = self.mk(http)
        res = p.generate(REQ(0), p.route_for(0))
        self.assertEqual(len(res.images), 1)
        post = http.posts()[0]
        self.assertEqual(post[1], "https://queue.fal.run/fal-ai/flux/dev")
        self.assertEqual(post[2]["Authorization"], "Key SECRETKEYVALUE")
        self.assertEqual(post[3]["image_size"], {"width": 1024, "height": 1280})
        self.assertEqual(post[3]["seed"], 7)
        self.assertNotIn("image_url", post[3])

    def test_edit_bodies(self):
        http = fal_http()
        p = self.mk(http)
        p.generate(REQ(1), p.route_for(1))
        self.assertTrue(http.posts()[0][3]["image_url"].startswith("data:image/jpeg;base64,"))
        http = fal_http()
        p = self.mk(http)
        p.generate(REQ(3), p.route_for(3))
        self.assertEqual(len(http.posts()[0][3]["image_urls"]), 3)

    def test_handle_saved_before_polling_and_resume_does_not_repost(self):
        handles = []
        p = self.mk(fal_http())
        p.generate(REQ(0), p.route_for(0), on_handle=handles.append)
        self.assertEqual(handles[0]["request_id"], "r1")
        http = fal_http(statuses=("COMPLETED",))
        p = self.mk(http)
        p.generate(REQ(0), p.route_for(0), resume=handles[0])
        self.assertEqual(http.posts(), [])

    def test_safety_filtered_candidate_is_reported_not_bypassed(self):
        http = fal_http(result={"images": [{"url": "https://cdn/i.png"}], "has_nsfw_concepts": [True]})
        p = self.mk(http)
        res = p.generate(REQ(0), p.route_for(0))
        self.assertEqual(res.images, [])
        self.assertIn("safety filter", res.notes[0])
        self.assertEqual(len(http.posts()), 1)   # no resubmit

    def test_failed_job_raises_without_resubmit(self):
        http = fal_http(statuses=("FAILED",))
        p = self.mk(http)
        with self.assertRaises(ProviderError):
            p.generate(REQ(0), p.route_for(0))
        self.assertEqual(len(http.posts()), 1)

    def test_timeout(self):
        p = FalProvider(http=fal_http(statuses=("IN_PROGRESS",)), config={"poll_timeout": 6}, sleep=lambda s: None)
        with self.assertRaises(ProviderError) as cm:
            p.generate(REQ(0), p.route_for(0))
        self.assertIn("timed out", str(cm.exception))

    def test_extra_overrides_parameter_names(self):
        http = fal_http()
        p = FalProvider(http=http, config={"extra": {"fal-ai/flux-kontext/dev": {"resolution_mode": "match_input"}}}, sleep=lambda s: None)
        p.generate(REQ(1), p.route_for(1))
        self.assertEqual(http.posts()[0][3]["resolution_mode"], "match_input")

    def test_estimate(self):
        p = self.mk(None)
        self.assertAlmostEqual(p.estimate_usd(p.route_for(0), 1024, 1280), 0.0393, places=3)

    def test_kontext_rounds_each_image_to_billed_megapixels(self):
        p = self.mk(None)
        route = p.route_for(1)
        self.assertEqual(p.estimate_usd(route, 1000, 1000), 0.025)
        self.assertEqual(p.estimate_usd(route, 1001, 1000), 0.05)
        self.assertEqual(p.estimate_usd(route, 1024, 1280), 0.05)
        self.assertEqual(2 * p.estimate_usd(route, 1024, 1280), 0.10)

    def test_kontext_price_override_does_not_change_other_routes(self):
        p = FalProvider(config={"kontext_usd_per_mp": 0.04})
        self.assertEqual(p.estimate_usd(p.route_for(1), 1024, 1280), 0.08)
        self.assertAlmostEqual(p.estimate_usd(p.route_for(0), 1024, 1280), 0.0393)


class ReplicateTests(unittest.TestCase):
    def setUp(self):
        import os
        os.environ["REPLICATE_API_TOKEN"] = "tok"
        self.addCleanup(os.environ.pop, "REPLICATE_API_TOKEN", None)

    def http(self, output, final="succeeded"):
        return FakeHttp({
            ("POST", "/predictions"): [{"id": "p1", "urls": {"get": "https://api.replicate.com/v1/predictions/p1"}}],
            ("GET", "/v1/predictions/p1"): [{"status": "processing"}, {"status": final, "output": output, "error": "boom"}],
            ("GET", "https://r/"): [IMG],
        })

    def test_string_and_list_outputs(self):
        for out in ("https://r/a.png", ["https://r/a.png"]):
            http = self.http(out)
            p = ReplicateProvider(http=http, sleep=lambda s: None)
            res = p.generate(REQ(1), p.route_for(1))
            self.assertEqual(len(res.images), 1)
        body = http.posts()[0][3]["input"]
        self.assertIn("input_image", body)
        self.assertEqual(http.posts()[0][2]["Authorization"], "Bearer tok")

    def test_failure(self):
        p = ReplicateProvider(http=self.http(None, "failed"), sleep=lambda s: None)
        with self.assertRaises(ProviderError):
            p.generate(REQ(0), p.route_for(0))


class HttpTests(unittest.TestCase):
    def test_post_is_never_retried_and_flags_ambiguity(self):
        import requests
        from slopgen.http import Http

        class S:
            posts = 0

            def post(self, *a, **k):
                S.posts += 1
                raise requests.ConnectionError("reset")

        with self.assertRaises(AmbiguousSubmit):
            Http(session=S()).post_json("https://x", {}, {})
        self.assertEqual(S.posts, 1)

    def test_get_retries_5xx_then_succeeds(self):
        from slopgen.http import Http

        class R:
            def __init__(self, c): self.status_code, self.content = c, b"ok"
            def json(self): return {"a": 1}

        class S:
            codes = [503, 502, 200]
            def get(self, *a, **k): return R(self.codes.pop(0))

        self.assertEqual(Http(session=S(), sleep=lambda s: None).get_json("https://x"), {"a": 1})


if __name__ == "__main__":
    unittest.main()
