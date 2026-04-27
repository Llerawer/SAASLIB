"""Shared pytest fixtures + env setup for the test suite.

Loaded once per test session by pytest. Sets defaults for required env vars
so tests that import `app.core.config` don't crash on eager Settings()
validation when no .env file is present (CI, fresh dev env).

Real values must be in a .env file for integration tests against Supabase;
these defaults are only enough to let imports succeed for unit tests with
mocked clients.
"""
import os
import sys

# Idempotent: existing env wins, so .env / shell env override these.
os.environ.setdefault("SUPABASE_URL", "https://stub.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub-key")

# Windows: python-magic-bin bundles libmagic.dll inside the magic package's
# libmagic/ subfolder, but loader.py only searches PATH. Add it here so
# `import magic` succeeds without requiring the developer to modify system PATH.
if sys.platform == "win32":
    import importlib.util
    _magic_spec = importlib.util.find_spec("magic")
    if _magic_spec and _magic_spec.submodule_search_locations:
        _magic_pkg_dir = str(_magic_spec.submodule_search_locations[0])
        _libmagic_dir = os.path.join(_magic_pkg_dir, "libmagic")
        if os.path.isdir(_libmagic_dir):
            os.environ["PATH"] = _libmagic_dir + os.pathsep + os.environ.get("PATH", "")
