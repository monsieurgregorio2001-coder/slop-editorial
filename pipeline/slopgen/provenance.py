"""Content-addressed source context without personal paths or environment values."""
import hashlib
import subprocess


def source_snapshot(plan):
    sources = {}
    for name, path in getattr(plan, "sources", {}).items():
        sources[name] = {"path": path.relative_to(plan.root).as_posix(),
                         "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    try:
        revision = subprocess.check_output(
            ["git", "-C", str(plan.root), "rev-parse", "HEAD"], stderr=subprocess.DEVNULL,
            text=True, timeout=5).strip()
    except (OSError, subprocess.SubprocessError):
        revision = None
    return {"revision": revision, "files": sources}
