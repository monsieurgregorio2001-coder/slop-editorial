import os
import tempfile
import unittest
from pathlib import Path

from slopgen.errors import AmbiguousSubmit, SlopError
from slopgen.pack import load_plan
from slopgen.providers.fal import FalProvider
from slopgen.providers.mock import MockProvider
from slopgen.runner import Runner
from slopgen.store import Store
from .helpers import PLAN, FakeHttp, png

IMG = png()


def fal_ok():
    return FakeHttp({
        ("POST", "queue.fal.run"): [{"request_id": "r1", "status_url": "https://q/s", "response_url": "https://q/r"}],
        ("GET", "https://q/s"): [{"status": "COMPLETED"}],
        ("GET", "https://q/r"): [{"images": [{"url": "https://cdn/i.png"}]}],
        ("GET", "https://cdn/"): [IMG],
    })


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plan = load_plan(PLAN)
        os.environ["FAL_KEY"] = "SECRETKEYVALUE"
        self.addCleanup(os.environ.pop, "FAL_KEY", None)

    def runner(self, provider=None):
        provider = provider or MockProvider()
        return Runner(self.plan, provider, Store(self.tmp.name, self.plan.name))

    def test_continuity_feeds_selected_frame_into_next_prompt(self):
        r = self.runner()
        r.run(only={"P1", "P2"}, progress=lambda *_: None)
        p3 = r.build_job(self.plan.prompt("P2"), 1)
        self.assertEqual(p3.state, "cached")
        self.assertEqual(p3.ref_labels, ["references/style-reference.png", "P1-c1*"])
        rec, _ = r.selected_record("P1")
        self.assertEqual(p3.request.refs[1], r.store.image_path(rec).read_bytes())

    def test_changing_selection_makes_only_downstream_stale(self):
        r = self.runner()
        r.run(only={"P1", "P2", "P4"}, progress=lambda *_: None)
        before = {(j.prompt_id, j.candidate): j.state for j in r.plan_jobs({"P1", "P2", "P4"})}
        self.assertEqual(set(before.values()), {"cached"})
        stale = r.select("P1", 2)
        self.assertIn("P2", stale)
        after = {(j.prompt_id, j.candidate): j.state for j in r.plan_jobs({"P1", "P2", "P4"})}
        self.assertEqual(after[("P1", 1)], "cached")
        self.assertEqual(after[("P4", 1)], "cached")
        self.assertEqual(after[("P2", 1)], "new")
        self.assertEqual(r.plan_jobs({"P2"})[0].ref_labels[1], "P1-c2")

    def test_rerun_is_free_when_nothing_changed(self):
        r = self.runner()
        r.run(only={"P1"}, progress=lambda *_: None)
        s = r.run(only={"P1"}, progress=lambda *_: None)
        self.assertEqual((s["done"], s["cached"]), (0, 2))

    def test_candidates_use_distinct_reproducible_seeds(self):
        jobs = self.runner().plan_jobs({"P1"})
        self.assertEqual([j.request.seed for j in jobs], [self.plan.seed, self.plan.seed + 1])

    def test_downstream_blocked_until_upstream_exists(self):
        jobs = self.runner().plan_jobs({"P2"})
        self.assertEqual({j.state for j in jobs}, {"blocked"})

    def test_optional_prompts_need_opt_in(self):
        ids = {j.prompt_id for j in self.runner().plan_jobs()}
        self.assertNotIn("P5", ids)
        ids = {j.prompt_id for j in self.runner().plan_jobs(include_optional=True)}
        self.assertIn("P5", ids)

    # ---- paid-run gates ---------------------------------------------------------------
    def fal_runner(self, http):
        return self.runner(FalProvider(http=http, sleep=lambda s: None))

    def test_paid_run_requires_yes_goref_and_budget(self):
        http = fal_ok()
        r = self.fal_runner(http)
        with self.assertRaisesRegex(SlopError, "--yes"):
            r.run(only={"P1"}, progress=lambda *_: None)
        with self.assertRaisesRegex(SlopError, "--approval-ref"):
            r.run(only={"P1"}, yes=True, progress=lambda *_: None)
        with self.assertRaisesRegex(SlopError, "exceeds"):
            r.run(only={"P1"}, yes=True, approval_ref="GO-x", max_usd=0.01, progress=lambda *_: None)
        self.assertEqual(http.posts(), [])   # nothing was submitted by any refused run

    def test_paid_run_goes_through_with_gates_met_and_logs_go_ref(self):
        http = fal_ok()
        r = self.fal_runner(http)
        s = r.run(only={"P1"}, yes=True, approval_ref="GO-test", progress=lambda *_: None)
        self.assertEqual(s["done"], 2)
        self.assertEqual(len(http.posts()), 2)
        self.assertIn("GO-test", (r.store.dir / "ledger.jsonl").read_text())
        self.assertGreater(r.store.spent_estimate(), 0)

    def test_failed_job_is_recorded_and_not_resubmitted(self):
        http = fal_ok()
        http.routes[("POST", "queue.fal.run")] = [AmbiguousSubmit("reset")]
        r = self.fal_runner(http)
        s = r.run(only={"P1"}, yes=True, approval_ref="GO-test", progress=lambda *_: None)
        self.assertEqual(s["failed"], 2)
        self.assertEqual(len(http.posts()), 2)   # one attempt per candidate, no loops
        self.assertEqual({j.state for j in r.plan_jobs({"P1"})}, {"uncertain"})

    def test_interrupted_job_resumes_by_polling_not_reposting(self):
        r = self.fal_runner(fal_ok())
        job = r.plan_jobs({"P1"})[0]
        r.store.save_job(job.fingerprint, {"prompt": "P1", "candidate": 1, "provider": "fal", "status": "submitted",
                                           "handle": {"request_id": "r9", "status_url": "https://q/s", "response_url": "https://q/r"},
                                           "estimate_usd": job.estimate_usd, "refs": []})
        self.assertEqual(r.plan_jobs({"P1"})[0].state, "resume")
        http = fal_ok()
        r2 = self.fal_runner(http)
        r2.store = r.store
        r2.run(only={"P1"}, yes=True, approval_ref="GO-test", progress=lambda *_: None)
        self.assertEqual(len(http.posts()), 1)   # only candidate 2 was posted

    def test_no_secret_or_personal_path_in_run_directory(self):
        r = self.fal_runner(fal_ok())
        r.run(only={"P1"}, yes=True, approval_ref="GO-test", progress=lambda *_: None)
        for p in Path(self.tmp.name).rglob("*"):
            if p.is_file() and p.suffix in (".json", ".jsonl"):
                text = p.read_text()
                self.assertNotIn("SECRETKEYVALUE", text)
                self.assertNotIn("/home/", text)
                self.assertNotIn("/" + "Users" + "/", text)
                self.assertNotIn(str(Path.home()), text)

    def test_select_unknown_candidate_rejected(self):
        r = self.runner()
        r.run(only={"P1"}, progress=lambda *_: None)
        with self.assertRaises(SlopError):
            r.select("P1", 9)


if __name__ == "__main__":
    unittest.main()
