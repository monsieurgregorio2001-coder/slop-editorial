"""Secret lookup. Keys are read from the environment, then (macOS only) the Keychain.

Nothing here writes, logs or returns a key anywhere except to the caller.
Rule: credentials never live in a file in this repository.
"""
import os
import subprocess
import sys

from .errors import MissingSecret

KEYCHAIN_SERVICE = "slopgen"


def get_secret(name: str, environ=None, runner=subprocess.run, platform=None) -> str:
    environ = os.environ if environ is None else environ
    value = (environ.get(name) or "").strip()
    if value:
        return value
    if (platform or sys.platform) == "darwin":
        try:
            out = runner(
                ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", name, "-w"],
                capture_output=True, text=True, timeout=15,
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass
    raise MissingSecret(
        f"{name} is not set. Export it, or on macOS store it in the Keychain: "
        f"security add-generic-password -s {KEYCHAIN_SERVICE} -a {name} -w   (prompts for the value)"
    )


def has_secret(name: str, **kw) -> bool:
    try:
        get_secret(name, **kw)
        return True
    except MissingSecret:
        return False
