"""On-disk run state: one directory per plan, keyed by job fingerprint.

runs/<plan>/jobs/<fp>.json      job record (status, provider handle, estimate, notes)
runs/<plan>/images/*.png        downloaded candidates (local only, gitignored)
runs/<plan>/selections.json     which candidate the human picked per prompt
runs/<plan>/ledger.jsonl        append-only event log (what/when/approval reference)

Records hold relative paths only, never personal filesystem paths or secrets.
"""
import json
import time
import os
import tempfile
from pathlib import Path


class Store:
    def __init__(self, base: Path, plan_name: str):
        self.dir = Path(base) / plan_name
        (self.dir / "jobs").mkdir(parents=True, exist_ok=True)
        (self.dir / "images").mkdir(parents=True, exist_ok=True)

    # ---- jobs ----------------------------------------------------------------
    def _job_path(self, fp):
        return self.dir / "jobs" / f"{fp}.json"

    def job(self, fp):
        p = self._job_path(fp)
        return json.loads(p.read_text()) if p.exists() else None

    def save_job(self, fp, rec):
        rec = {**rec, "fingerprint": fp, "updated": _now()}
        _atomic_json(self._job_path(fp), rec)

    def image_path(self, rec):
        return self.dir / "images" / rec["image"] if rec.get("image") else None

    def write_image(self, name, data: bytes):
        (self.dir / "images" / name).write_bytes(data)
        return name

    def jobs_for(self, pid, provider):
        out = []
        for p in sorted((self.dir / "jobs").glob("*.json")):
            rec = json.loads(p.read_text())
            if rec.get("prompt") == pid and rec.get("provider") == provider:
                out.append(rec)
        return sorted(out, key=lambda r: r["candidate"])

    def done_candidates(self, pid, provider):
        """Latest completed job per candidate number, newest wins."""
        best = {}
        for r in self.jobs_for(pid, provider):
            if r["status"] == "done" and r.get("image"):
                cur = best.get(r["candidate"])
                if cur is None or r["updated"] >= cur["updated"]:
                    best[r["candidate"]] = r
        return [best[k] for k in sorted(best)]

    # ---- selections ----------------------------------------------------------
    def selections(self):
        p = self.dir / "selections.json"
        return json.loads(p.read_text()) if p.exists() else {}

    def select(self, pid, provider, candidate, fingerprint):
        s = self.selections()
        s[pid] = {"provider": provider, "candidate": candidate, "fingerprint": fingerprint}
        _atomic_json(self.dir / "selections.json", s)
        self.log("selected", prompt=pid, provider=provider, candidate=candidate)

    # ---- ledger --------------------------------------------------------------
    def log(self, event, **fields):
        with open(self.dir / "ledger.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"t": _now(), "event": event, **fields}, sort_keys=True) + "\n")

    def spent_estimate(self):
        total = 0.0
        for p in (self.dir / "jobs").glob("*.json"):
            r = json.loads(p.read_text())
            if r.get("status") in ("done", "filtered", "submitted", "submitting", "uncertain", "failed"):
                total += r.get("reserved_usd", r.get("estimate_usd", 0))
        return round(total, 4)


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _atomic_json(path, value):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)
