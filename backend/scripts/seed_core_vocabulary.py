"""Seed core_vocabulary table from backend/data/core_vocabulary.yaml.

Thin entry point — logic lives in app/services/core_vocabulary_seed.py.

Idempotent: TRUNCATE + INSERT semantics. YAML is the source of truth.
To remove a word, delete it from YAML and re-run.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add backend/ to import path so we can import app.* from a script.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_ROOT))

from app.db.supabase_client import get_admin_client  # noqa: E402
from app.services.core_vocabulary_seed import parse_yaml, seed_table  # noqa: E402

_YAML_PATH = _BACKEND_ROOT / "data" / "core_vocabulary.yaml"


def main() -> int:
    if not _YAML_PATH.exists():
        print(
            f"ERROR: {_YAML_PATH} not found. "
            "Run bootstrap_core_vocabulary.py first.",
            file=sys.stderr,
        )
        return 1
    rows = parse_yaml(_YAML_PATH)
    print(f"Parsed {len(rows)} rows from {_YAML_PATH.name}")
    client = get_admin_client()
    seed_table(client, rows)
    print(f"Seeded core_vocabulary: {len(rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
