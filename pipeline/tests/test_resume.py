"""Spend-safety regressions: a failed poll resumes without a new charge, an unclear submit is never repeated."""
import os
import tempfile
import unittest
from unittest.mock import patch

from slopgen.errors import AmbiguousSubmit, ProviderError, SlopError
from slopgen.pack import load_plan
from slopgen.providers.fal import FalProvider
from slopgen.runner import Runner
from slopgen.store import Store
from .helpers import PLAN, FakeHttp, png


class SpendSafety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env = patch.dict(os.environ, {"FAL_KEY": "FAKE-TEST-KEY"})
        env.start(); self.addCleanup(env.stop)
        self.plan = load_plan(PLAN)
        self.plan.candidates = 1
        self.store = Store(self.tmp.name, self.plan.name)

    def http(self, poll_fails=False):
        return FakeHttp({
            ("POST", "queue.fal.run"): [{"request_id": "paid-once", "status_url": "https://fake/s", "response_url": "https://fake/r"}],
            ("GET", "https://fake/s"): [ProviderError("temporary failure")] if poll_fails else [{"status": "COMPLETED"}],
            ("GET", "https://fake/r"): [{"images": [{"url": "https://fake/i"}]}],
            ("GET", "https://fake/i"): [png()],
        })

    def test_poll_failure_resumes_without_new_charge(self):
        http = self.http(poll_fails=True)
        runner = Runner(self.plan, FalProvider(http=http), self.store)
        runner.run(only={"P1"}, yes=True, approval_ref="test", progress=lambda *_: None)
        self.assertEqual(runner.plan_jobs({"P1"})[0].state, "resume")
        reserved = self.store.spent_estimate()
        http.routes[("GET", "https://fake/s")] = [{"status": "COMPLETED"}]
        result = runner.run(only={"P1"}, yes=True, approval_ref="test", max_usd=0, progress=lambda *_: None)
        self.assertEqual(result["done"], 1)
        self.assertEqual(len(http.posts()), 1)               # never posted twice
        self.assertEqual(self.store.spent_estimate(), reserved)
        self.assertGreater(reserved, 0)

    def test_uncertain_submit_blocks_until_explicit_retry(self):
        http = self.http()
        http.routes[("POST", "queue.fal.run")] = [AmbiguousSubmit("unknown")]
        runner = Runner(self.plan, FalProvider(http=http), self.store)
        runner.run(only={"P1"}, yes=True, approval_ref="test", progress=lambda *_: None)
        self.assertEqual(runner.plan_jobs({"P1"})[0].state, "uncertain")
        with self.assertRaisesRegex(SlopError, "retry-uncertain"):
            runner.run(only={"P1"}, yes=True, approval_ref="test", progress=lambda *_: None)
        self.assertEqual(len(http.posts()), 1)

    def test_negative_or_nan_cap_rejected(self):
        runner = Runner(self.plan, FalProvider(http=self.http()), self.store)
        for cap in (-1, float("nan"), float("inf")):
            with self.assertRaises(SlopError):
                runner.run(only={"P1"}, yes=True, approval_ref="test", max_usd=cap, progress=lambda *_: None)


if __name__ == "__main__":
    unittest.main()
