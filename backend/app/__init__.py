"""App package init.

Windows-only libmagic bootstrap: python-magic-bin bundles libmagic.dll inside
the magic package's libmagic/ subfolder, but the magic loader only searches
PATH. Prepend that folder so `import magic` succeeds at uvicorn startup.

No-op on Linux/macOS where libmagic is provided by the system.
"""
import os
import sys

if sys.platform == "win32":
    import importlib.util

    _magic_spec = importlib.util.find_spec("magic")
    if _magic_spec and _magic_spec.submodule_search_locations:
        _magic_pkg_dir = str(_magic_spec.submodule_search_locations[0])
        _libmagic_dir = os.path.join(_magic_pkg_dir, "libmagic")
        if os.path.isdir(_libmagic_dir):
            os.environ["PATH"] = _libmagic_dir + os.pathsep + os.environ.get("PATH", "")
