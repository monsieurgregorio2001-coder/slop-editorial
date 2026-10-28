"""Plan and run generation jobs with continuity.

Continuity means each prompt's reference images are the identity master plus the selected
candidates of earlier prompts (the `chain:` entries in the plan). A job's fingerprint covers
the exact reference bytes, so changing a selection makes only the downstream prompts stale,
and an unchanged job is never paid for twice.
"""
import hashlib
import json
from dataclasses import dataclass, field

from .errors import PlanError, SlopError
from .execution import validate_cap, begin_attempt, record_failure, record_state
from .spend import refusal
from .provenance import source_snapshot
from .providers.base import GenRequest

T5_LIMIT = 512   # Flux-family text encoders truncate around here


@dataclass
class Job:
    prompt_id: str
    candidate: int
    fingerprint: str
    route: object
    request: GenRequest
    ref_labels: list
    dropped: list
    estimate_usd: float
    state: str          # cached | new | retry | resume | blocked
    warnings: list = field(default_factory=list)


class Runner:
    def __init__(self, plan, provider, store, free=False):
        self.plan, self.provider, self.store = plan, provider, store
        self.free = free or getattr(provider, "free", False)

    # ---- selection -----------------------------------------------------------
    def current_candidates(self, pid):
        prompt = self.plan.prompt(pid)
        out = []
        for candidate in range(1, self.plan.candidates + 1):
            job = self.build_job(prompt, candidate)
            rec = self.store.job(job.fingerprint) if job.fingerprint else None
            if rec and rec.get("status") == "done":
                path = self.store.image_path(rec)
                if path and path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == rec.get("image_sha256"):
                    out.append({**rec, "fingerprint": job.fingerprint})
        return out

    def selected_record(self, pid):
        sel = self.store.selections().get(pid)
        cands = self.current_candidates(pid)
        if sel and sel.get("provider") == self.provider.name:
            for r in cands:
                if r["fingerprint"] == sel.get("fingerprint"):
                    return r, False
        return (cands[0], True) if cands else (None, True)   # (record, provisional)

    def _ref_bytes(self, ref):
        if ref.file:
            return (self.plan.root / ref.file).read_bytes(), ref.file
        rec, prov = self.selected_record(ref.chain)
        if rec is None:
            return None, f"{ref.chain}(pending)"
        label = f"{ref.chain}-c{rec['candidate']}" + ("*" if prov else "")
        return self.store.image_path(rec).read_bytes(), label

    # ---- job construction ----------------------------------------------------
    def build_job(self, prompt, candidate):
        refs, labels = [], []
        for r in prompt.refs:
            b, label = self._ref_bytes(r)
            labels.append(label)
            if b is None:
                refs = None
            elif refs is not None:
                refs.append(b)
        warnings = []
        if prompt.est_tokens > T5_LIMIT and self.provider.name != "mock":
            warnings.append(f"prompt ~{prompt.est_tokens} tokens; Flux-family encoders keep about {T5_LIMIT}")
        n_refs = len(prompt.refs)
        route = self.provider.route_for(n_refs)
        est = self.provider.estimate_usd(route, self.plan.width, self.plan.height)
        seed = self.plan.seed + candidate - 1
        if refs is None:
            return Job(prompt.id, candidate, "", route, None, labels, [], est, "blocked", warnings)
        kept, dropped = self.provider.pick_refs(refs, route)
        if dropped:
            warnings.append("route takes %d reference(s); dropped %s" % (route.max_refs, [labels[i] for i in dropped]))
        kept_refs = [refs[i] for i in kept]
        ident = {
            "provider": self.provider.name, "model": route.model, "prompt": prompt.text,
            "refs": [hashlib.sha256(b).hexdigest() for b in kept_refs], "seed": seed,
            "w": self.plan.width, "h": self.plan.height,
            "extra": self.provider.config.get("extra", {}),
        }
        fp = hashlib.sha256(json.dumps(ident, sort_keys=True).encode()).hexdigest()
        req = GenRequest(prompt.text, self.plan.width, self.plan.height, seed, kept_refs)
        rec = self.store.job(fp)
        state = "new"
        if rec:
            state = record_state(rec)
            if rec.get("status") == "done":
                path = self.store.image_path(rec)
                if not path or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != rec.get("image_sha256"):
                    state = "resume" if rec.get("handle") else "uncertain"
        return Job(prompt.id, candidate, fp, route, req, [labels[i] for i in kept], [labels[i] for i in dropped],
                   0.0 if state in ("cached", "resume") else est, state, warnings)

    def _selected_prompts(self, only=None, include_optional=False):
        out = []
        for p in self.plan.prompts:
            if only and p.id not in only:
                continue
            if p.optional and not include_optional and not (only and p.id in only):
                continue
            out.append(p)
        return out

    def plan_jobs(self, only=None, include_optional=False):
        jobs = []
        for p in self._selected_prompts(only, include_optional):
            for c in range(1, self.plan.candidates + 1):
                jobs.append(self.build_job(p, c))
        return jobs

    def estimate_total(self, jobs):
        """Blocked jobs have no fingerprint yet; count them at full price (they depend on a new upstream)."""
        return round(sum(j.estimate_usd if j.state != "blocked" else
                         self.provider.estimate_usd(j.route, self.plan.width, self.plan.height) for j in jobs
                         if j.state in ("new", "retry", "uncertain", "blocked")), 4)

    # ---- execution -----------------------------------------------------------
    def run(self, only=None, include_optional=False, max_usd=5.0, yes=False, approval_ref=None, progress=print, retry_uncertain=False):
        validate_cap(max_usd)
        jobs = self.plan_jobs(only, include_optional)
        unresolved = [j for j in jobs if j.state == "uncertain"]
        if unresolved and not retry_uncertain:
            raise SlopError("unresolved submission: inspect provider history before --retry-uncertain; a prior charge may exist")
        total = self.estimate_total(jobs)
        message = refusal(total, max_usd, self.provider.name, self.free, yes, approval_ref)
        if message:
            raise SlopError(message)
        spent = 0.0
        summary = {"done": 0, "cached": 0, "filtered": 0, "failed": 0, "spent_estimate": 0.0}
        self.store.log("run_started", provider=self.provider.name, approval_ref=approval_ref, estimate=total,
                       only=sorted(only) if only else None)
        for prompt in self._selected_prompts(only, include_optional):
            for c in range(1, self.plan.candidates + 1):
                job = self.build_job(prompt, c)        # rebuilt now: upstream may have just finished
                if job.state == "blocked":
                    progress(f"{prompt.id} c{c}: skipped, reference {job.ref_labels} not generated yet")
                    summary["failed"] += 1
                    continue
                if job.state == "cached":
                    summary["cached"] += 1
                    progress(f"{prompt.id} c{c}: cached")
                    continue
                if job.state == "uncertain" and not retry_uncertain:
                    raise SlopError("unresolved downstream submission: inspect provider history before --retry-uncertain")
                if not self.free and spent + job.estimate_usd > max_usd:
                    raise SlopError(f"budget cap ${max_usd:.2f} reached before {prompt.id} c{c}; nothing further submitted")
                outcome = self._execute(prompt, job, progress, approval_ref)
                summary[outcome] += 1
                spent += job.estimate_usd
        summary["spent_estimate"] = round(spent, 4)
        self.store.log("run_finished", **summary)
        return summary

    def _execute(self, prompt, job, progress, approval_ref):
        fp = job.fingerprint
        rec = self.store.job(fp) or {}
        base = {"prompt": prompt.id, "candidate": job.candidate, "provider": self.provider.name,
                "model": job.route.model, "seed": job.request.seed, "refs": job.ref_labels,
                "estimate_usd": rec.get("estimate_usd", job.estimate_usd) if job.state == "resume" else job.estimate_usd,
                "prompt_title": prompt.title, "prompt_text": prompt.text,
                "plan": self.plan.name, "sources": source_snapshot(self.plan),
                "width": job.request.width, "height": job.request.height,
                "reference_sha256": [hashlib.sha256(b).hexdigest() for b in job.request.refs],
                "parameters": getattr(self.provider, "cfg", self.provider.config), "approval_ref": rec.get("approval_ref", approval_ref) if job.state == "resume" else approval_ref,
                "publication_state": "unpublished", "fingerprint": fp}

        base = begin_attempt(self.store, fp, base, resume=(job.state == "resume"))

        def on_handle(handle):
            self.store.save_job(fp, {**base, "status": "submitted", "handle": handle})
            self.store.log("submitted", prompt=prompt.id, candidate=job.candidate, request=handle.get("request_id"))

        resume = rec.get("handle") if job.state == "resume" else None
        progress(f"{prompt.id} c{job.candidate}: {'resuming' if resume else 'submitting'} via {job.route.model} "
                 f"(refs: {', '.join(job.ref_labels) or 'none'})")
        try:
            res = self.provider.generate(job.request, job.route, on_handle=on_handle, resume=resume)
        except SlopError as e:
            record_failure(self.store, fp, base, e)
            self.store.log("failed", prompt=prompt.id, candidate=job.candidate, error=str(e)[:300])
            progress(f"{prompt.id} c{job.candidate}: FAILED {e}")
            return "failed"
        if not res.images:
            self.store.save_job(fp, {**base, "status": "filtered", "notes": res.notes, "request_id": res.request_id})
            progress(f"{prompt.id} c{job.candidate}: no image returned ({'; '.join(res.notes)})")
            return "filtered"
        name = f"{prompt.id}-c{job.candidate}-{fp[:8]}.png"
        self.store.write_image(name, res.images[0])
        self.store.save_job(fp, {**base, "handle": (self.store.job(fp) or {}).get("handle"), "status": "done", "image": name, "request_id": res.request_id,
                                 "notes": res.notes,
                                 "image_sha256": hashlib.sha256(res.images[0]).hexdigest()})
        self.store.log("done", prompt=prompt.id, candidate=job.candidate, image=name)
        progress(f"{prompt.id} c{job.candidate}: done -> {name}")
        return "done"

    # ---- selection -----------------------------------------------------------
    def select(self, pid, candidate):
        self.plan.prompt(pid)
        records = self.current_candidates(pid)
        have = [r["candidate"] for r in records]
        if candidate not in have:
            raise PlanError(f"{pid} has no finished candidate {candidate} (have {have})")
        record = next(r for r in records if r["candidate"] == candidate)
        self.store.select(pid, self.provider.name, candidate, record["fingerprint"])
        stale = [p.id for p in self.plan.prompts if any(r.chain == pid for r in p.refs)]
        return stale
