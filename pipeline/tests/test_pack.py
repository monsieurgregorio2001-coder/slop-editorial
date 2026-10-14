import tempfile
import unittest
from pathlib import Path

from slopgen.errors import PlanError
from slopgen.pack import expand_blocks, extract_block, extract_prompt, load_plan
from .helpers import PLAN, ROOT


class PackTests(unittest.TestCase):
    def test_sample_plan_parses_every_prompt(self):
        plan = load_plan(PLAN)
        self.assertEqual([p.id for p in plan.prompts], ["P1", "P2", "P3", "P4", "P5"])
        for p in plan.prompts:
            self.assertNotRegex(p.text, r"^\[[^\]]+\]\s*$", p.id)
            self.assertIn("Restraint:", p.text, p.id)   # shared block expanded
        self.assertEqual((plan.width, plan.height), (1024, 1280))

    def test_pack_wording_is_untouched(self):
        md = (ROOT / "prompts/ai-and-taste.md").read_text()
        _, raw = extract_prompt(md, "Prompt 4")
        self.assertTrue(load_plan(PLAN).prompt("P4").text.startswith(raw.split("[RESTRAINT]")[0].strip()))

    def test_every_prompt_forbids_text_and_people(self):
        for p in load_plan(PLAN).prompts:
            self.assertIn("No text", p.text, p.id)
            self.assertIn("no people", p.text, p.id)

    def test_chain_refs(self):
        plan = load_plan(PLAN)
        refs = lambda pid: [r.file or r.chain for r in plan.prompt(pid).refs]
        self.assertEqual(refs("P2"), ["references/style-reference.png", "P1"])
        self.assertEqual(refs("P3"), ["P1", "P2"])
        self.assertEqual(refs("P4"), [])

    def test_expand_rejects_unknown_placeholder(self):
        with self.assertRaises(PlanError):
            expand_blocks("a\n[MYSTERY]\nb", {"LIGHT": "x"})

    def test_missing_heading_and_block(self):
        with self.assertRaises(PlanError):
            extract_prompt("### A\n```text\nx\n```", "B")
        with self.assertRaises(PlanError):
            extract_block("nothing", "marker")

    def _tmp_project(self, plan_text):
        d = Path(tempfile.mkdtemp())
        (d / "plans").mkdir(); (d / "prompts").mkdir()
        (d / "prompts/a.md").write_text("### P1\n```text\nhello\n```\n### P2\n```text\nworld\n```\n")
        (d / "plans/plan.yaml").write_text(plan_text)
        return d

    def test_chain_must_point_backwards(self):
        d = self._tmp_project(
            "name: t\nsources: {a: prompts/a.md}\nprompts:\n"
            " - {id: A, source: a, heading: 'P1', refs: [{chain: B}]}\n"
            " - {id: B, source: a, heading: 'P2'}\n")
        with self.assertRaises(PlanError):
            load_plan(d / "plans/plan.yaml")

    def test_duplicate_ids_and_missing_reference_file_rejected(self):
        d = self._tmp_project(
            "name: t\nsources: {a: prompts/a.md}\nprompts:\n"
            " - {id: A, source: a, heading: 'P1'}\n - {id: A, source: a, heading: 'P2'}\n")
        with self.assertRaises(PlanError):
            load_plan(d / "plans/plan.yaml")
        d = self._tmp_project(
            "name: t\nsources: {a: prompts/a.md}\nprompts:\n"
            " - {id: A, source: a, heading: 'P1', refs: [{file: nope.png}]}\n")
        with self.assertRaises(PlanError):
            load_plan(d / "plans/plan.yaml")


if __name__ == "__main__":
    unittest.main()
