import math
import unittest

from slopgen import spend, spend_fixtures
from slopgen.errors import SlopError
from slopgen.runner import Runner
from slopgen.pack import load_plan
from slopgen.providers import make_provider
from slopgen.store import Store

from .helpers import PLAN, ROOT


class SpendTests(unittest.TestCase):
    def _tmp(self):
        import tempfile
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        return d.name

    def test_messages_are_the_cli_strings(self):
        self.assertEqual(spend.msg_need_yes(1.2, "fal"), "estimated spend $1.20 on fal; rerun with --yes to proceed")
        self.assertEqual(spend.msg_over_cap(6.5, 5), "estimated $6.50 exceeds --max-usd 5.00; raise the cap or narrow with --only")
        self.assertEqual(spend.MSG_NO_APPROVAL, "paid runs need --approval-ref naming the recorded human approval")

    def test_refusal_order_matches_the_runner(self):
        self.assertIn("--yes", spend.refusal(9, 5, "fal", False, False, None))
        self.assertIn("--approval-ref", spend.refusal(9, 5, "fal", False, True, None))
        self.assertIn("exceeds", spend.refusal(9, 5, "fal", False, True, "A-1"))
        self.assertIsNone(spend.refusal(4, 5, "fal", False, True, "A-1"))
        self.assertIsNone(spend.refusal(900, 5, "mock", True, False, None))

    def test_invalid_cap_is_refused_before_anything_else(self):
        for cap in (-1, math.nan, math.inf):
            self.assertEqual(spend.refusal(1, cap, "fal", False, False, None), spend.MSG_CAP_INVALID)
            with self.assertRaisesRegex(SlopError, "finite, non-negative"):
                spend.validate_cap(cap)

    def test_runner_uses_the_same_function(self):
        plan = load_plan(PLAN, ROOT)
        runner = Runner(plan, make_provider("fal"), Store(self._tmp(), plan.name))
        total = runner.estimate_total(runner.plan_jobs())
        with self.assertRaises(SlopError) as ctx:
            runner.run(max_usd=0.01, yes=True, approval_ref="A-1")
        self.assertEqual(str(ctx.exception), spend.msg_over_cap(total, 0.01))

    def test_price_table_covers_every_provider_and_route(self):
        rows = spend.price_table(1024, 1280)
        self.assertEqual({r["provider"] for r in rows}, {"mock", "fal", "replicate"})
        self.assertTrue(all(r["usd"] == 0 for r in rows if r["provider"] == "mock"))
        self.assertTrue(all(r["usd"] > 0 for r in rows if r["provider"] != "mock"))

    def test_committed_parity_fixtures_match_this_package(self):
        self.assertTrue(spend_fixtures.OUT.exists(), "run: python -m slopgen.spend_fixtures")
        self.assertEqual(spend_fixtures.OUT.read_text(), spend_fixtures.render(),
                         "site/test/fixtures/spend-parity.json is stale. Run: python -m slopgen.spend_fixtures")

    def test_committed_mock_record_matches_a_fresh_mock_run(self):
        from slopgen import mock_record
        self.assertEqual(mock_record.main(["--check"]), 0, "run: python -m slopgen.mock_record")


if __name__ == "__main__":
    unittest.main()
