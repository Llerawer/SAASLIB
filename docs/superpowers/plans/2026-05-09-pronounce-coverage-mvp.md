# Pronounce Coverage MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V0 coverage radar — a curated `core_vocabulary` map (3 layers, ~500 words) + an admin-gated `GET /api/v1/admin/coverage` endpoint + `show_coverage.py` CLI that surface gaps in the existing pronounce corpus, without touching the existing ingestion pipeline or frontend.

**Architecture:** Source-of-truth YAML in `backend/data/core_vocabulary.yaml` (versioned, PR-reviewable) seeded via `seed_core_vocabulary.py` (TRUNCATE+INSERT, normalized via existing spaCy lemmatizer) into a new `core_vocabulary` Postgres table. Coverage derived by `LEFT JOIN` against existing `pronunciation_word_index` — no changes to ingestion. Endpoint and CLI both consume the same `coverage_service` module. Admin auth is a whitelist of Supabase user IDs from env (`ADMIN_USER_IDS`), checked on top of existing JWT auth.

**Tech Stack:** FastAPI + Pydantic + asyncpg, Supabase (Postgres + JWT auth), spaCy (existing lemmatizer), pytest + unittest.mock (existing test pattern), PyYAML for source-of-truth file.

**Spec reference:** [docs/superpowers/specs/2026-05-09-pronounce-coverage-mvp-design.md](../specs/2026-05-09-pronounce-coverage-mvp-design.md)

---

## File Structure

### Files to create

```text
backend/
├── app/
│   ├── api/v1/
│   │   └── coverage.py                       -- FastAPI router (admin endpoint)
│   ├── core/
│   │   └── admin_auth.py                     -- require_admin() dependency
│   └── services/
│       ├── coverage.py                       -- query + status derivation logic
│       └── core_vocabulary_seed.py           -- YAML parse + normalization + insert
├── data/
│   └── core_vocabulary.yaml                  -- source of truth (initial bootstrapped)
├── scripts/
│   ├── apply_migration_21.py                 -- migration applier
│   ├── bootstrap_core_vocabulary.py          -- generates initial YAML with top-200 frequency
│   ├── seed_core_vocabulary.py               -- thin entry point → core_vocabulary_seed
│   └── show_coverage.py                      -- CLI tabular output
└── tests/
    ├── test_admin_auth.py                    -- whitelist gating
    ├── test_core_vocabulary_seed.py          -- YAML parse + normalization
    ├── test_coverage_service.py              -- status derivation, summary aggregation
    └── test_coverage_api.py                  -- endpoint shape, auth gating

supabase/migrations/
└── 00000000000021_core_vocabulary.sql        -- DDL + coverage_rows() RPC
```

### Files to modify

```text
backend/app/main.py                      -- include coverage.router
backend/app/core/config.py               -- add ADMIN_USER_IDS field
backend/requirements.txt                 -- add pyyaml (verify if missing)
```

### Boundaries

- `services/coverage.py` is pure (pluggable Supabase client) — testable with mock.
- `core/admin_auth.py` only knows whitelist semantics — independent of the coverage feature.
- Scripts are entry points; logic lives in services.
- Tests mock the Supabase client following the [test_decks_api.py](../../../backend/tests/test_decks_api.py) pattern.

---

## Task 1: Database migration + applier

**Files:**

- Create: `supabase/migrations/00000000000021_core_vocabulary.sql`
- Create: `backend/scripts/apply_migration_21.py`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/00000000000021_core_vocabulary.sql`:

```sql
-- =========================================================================
-- core_vocabulary — editorial map of words we MUST cover well.
--
-- This table is the source of "what to measure coverage against". Rows are
-- seeded from backend/data/core_vocabulary.yaml via scripts/seed_core_vocabulary.py
-- with TRUNCATE+INSERT semantics. Never edit directly; edit the YAML.
--
-- Three semantic categories:
--   frequency : ~200 high-frequency content words (linguistic backbone)
--   academic  : ~200 connective/explanatory words (editorial differentiator)
--   pain      : ~150 pronunciation-difficulty words (product moat)
--
-- The `word` column stores the LEMMATIZED form so it joins 1:1 against
-- pronunciation_word_index.word (which is also lemmatized via the same
-- spaCy normalize() function used during ingestion).
-- =========================================================================

create table if not exists public.core_vocabulary (
    word text primary key,
    category text not null,
    priority integer not null default 100,
    created_at timestamptz not null default now(),

    constraint core_vocabulary_category_valid
      check (category in ('frequency', 'academic', 'pain'))
);

create index if not exists idx_core_vocabulary_category_priority
    on public.core_vocabulary(category, priority);
```

- [ ] **Step 2: Write the applier script**

Create `backend/scripts/apply_migration_21.py`:

```python
"""One-shot: apply migration 21 (core_vocabulary) to remote Supabase.

Idempotent — re-running is safe (migration uses IF NOT EXISTS).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv


async def main() -> int:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not in .env", file=sys.stderr)
        return 1

    sql_path = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "00000000000021_core_vocabulary.sql"
    )
    if not sql_path.exists():
        print(f"ERROR: migration not found at {sql_path}", file=sys.stderr)
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    print(f"Applying {sql_path.name} ({len(sql)} chars)...")

    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 3: Apply migration to local/dev DB**

Run: `python backend/scripts/apply_migration_21.py`
Expected: prints `Applying 00000000000021_core_vocabulary.sql (XXX chars)...` then `OK`. Re-run to confirm idempotent.

- [ ] **Step 4: Verify table exists**

Run (psql or Supabase Studio):

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'core_vocabulary' ORDER BY ordinal_position;
```

Expected: 4 rows (`word text`, `category text`, `priority integer`, `created_at timestamptz`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00000000000021_core_vocabulary.sql backend/scripts/apply_migration_21.py
git commit -m "feat(coverage): add core_vocabulary table migration"
```

---

## Task 2: Admin auth dependency

**Files:**

- Modify: `backend/app/core/config.py`
- Create: `backend/app/core/admin_auth.py`
- Create: `backend/tests/test_admin_auth.py`

- [ ] **Step 1: Add `ADMIN_USER_IDS` setting**

Modify `backend/app/core/config.py`. Add after the `DEEPL_API_KEY` field:

```python
    # ===== Admin gating =====
    # Comma-separated Supabase user_ids allowed to hit /api/v1/admin/* endpoints.
    # Empty string = no admin access (default — fail closed).
    ADMIN_USER_IDS: str = ""
```

- [ ] **Step 2: Write failing test for `require_admin`**

Create `backend/tests/test_admin_auth.py`:

```python
"""Admin auth — whitelist gating."""
import pytest
from fastapi import HTTPException


def test_require_admin_allows_listed_user(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1,u2")
    # Should not raise
    result = require_admin(current_user_id="u2")
    assert result == "u2"


def test_require_admin_rejects_unlisted_user(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1,u2")
    with pytest.raises(HTTPException) as exc:
        require_admin(current_user_id="u3")
    assert exc.value.status_code == 403


def test_require_admin_rejects_when_whitelist_empty(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "")
    with pytest.raises(HTTPException) as exc:
        require_admin(current_user_id="u1")
    assert exc.value.status_code == 403


def test_require_admin_handles_whitespace(monkeypatch):
    from app.core.admin_auth import require_admin
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", " u1 , u2 ")
    result = require_admin(current_user_id="u1")
    assert result == "u1"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_admin_auth.py -v`
Expected: 4 FAIL with "ModuleNotFoundError: No module named 'app.core.admin_auth'".

- [ ] **Step 4: Implement `require_admin`**

Create `backend/app/core/admin_auth.py`:

```python
"""Admin gating: only users listed in ADMIN_USER_IDS can hit /api/v1/admin/*.

Reuses the existing JWT auth (get_current_user_id). On top of that, checks
the user_id against a whitelist from env. Fails closed: empty whitelist
rejects everyone.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from app.core.auth import get_current_user_id
from app.core.config import settings


def _allowed_user_ids() -> set[str]:
    raw = settings.ADMIN_USER_IDS or ""
    return {part.strip() for part in raw.split(",") if part.strip()}


def require_admin(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    """FastAPI dependency. Returns user_id if admin; raises 403 otherwise."""
    allowed = _allowed_user_ids()
    if current_user_id not in allowed:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user_id
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_admin_auth.py -v`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/config.py backend/app/core/admin_auth.py backend/tests/test_admin_auth.py
git commit -m "feat(auth): add require_admin dependency with user_id whitelist"
```

---

## Task 3: Bootstrap script — generate initial YAML

**Files:**

- Create: `backend/scripts/bootstrap_core_vocabulary.py`
- Create: `backend/data/core_vocabulary.yaml` (output of script — committed for reference)

- [ ] **Step 1: Write the bootstrap script**

Create `backend/scripts/bootstrap_core_vocabulary.py`:

```python
"""Generate the initial backend/data/core_vocabulary.yaml.

Strategy:
  - Embeds a hardcoded list of ~200 high-frequency English content words
    (excluding stopwords already filtered by pronunciation._INDEX_STOP_WORDS,
    so every word has a chance to appear in pronunciation_word_index).
  - Leaves `academic` and `pain` sections empty with placeholder comments
    so the founder fills them incrementally in PRs.

Idempotent — overwrites the YAML each run. Run once at project bootstrap.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Top-200 high-frequency English content words, manually curated to exclude
# stopwords that the pronunciation pipeline filters out via _INDEX_STOP_WORDS.
# Source: derived from Brown corpus + COCA top frequencies, deduplicated
# against the stopword list in app/services/pronunciation.py.
_TOP_200_FREQUENCY: list[str] = [
    "people", "year", "way", "day", "thing", "man", "world", "life",
    "hand", "part", "child", "eye", "woman", "place", "work", "week",
    "case", "point", "government", "company", "number", "group", "problem",
    "fact", "good", "new", "first", "last", "long", "great", "little",
    "own", "other", "old", "right", "big", "high", "different", "small",
    "large", "next", "early", "young", "important", "few", "public",
    "bad", "same", "able", "make", "know", "get", "go", "take", "see",
    "come", "think", "look", "want", "give", "use", "find", "tell",
    "ask", "work", "seem", "feel", "try", "leave", "call", "say",
    "show", "hear", "play", "run", "move", "live", "believe", "hold",
    "bring", "happen", "write", "provide", "sit", "stand", "lose",
    "pay", "meet", "include", "continue", "set", "learn", "change",
    "lead", "understand", "watch", "follow", "stop", "create", "speak",
    "read", "allow", "add", "spend", "grow", "open", "walk", "win",
    "offer", "remember", "love", "consider", "appear", "buy", "wait",
    "serve", "die", "send", "expect", "build", "stay", "fall", "cut",
    "reach", "kill", "remain", "house", "school", "country", "family",
    "system", "story", "money", "month", "lot", "right", "study", "book",
    "job", "word", "business", "issue", "side", "kind", "head", "service",
    "friend", "father", "power", "hour", "game", "line", "end", "member",
    "law", "car", "city", "community", "name", "president", "team",
    "minute", "idea", "kid", "body", "information", "back", "parent",
    "face", "level", "office", "door", "health", "person", "art", "war",
    "history", "party", "result", "morning", "reason", "research", "girl",
    "guy", "moment", "air", "teacher", "force", "education", "foot",
    "boy", "age", "policy", "process", "music", "market", "sense",
    "nation", "plan", "college", "interest", "death", "experience",
    "effect", "use", "class", "control", "care", "field", "development",
    "role", "effort",
]

_HEADER = """\
# core_vocabulary — editorial map of words we want to cover well in the
# pronounce corpus. This file is the source of truth; the SQL table is
# always derived from it via scripts/seed_core_vocabulary.py.
#
# THREE LAYERS:
#   frequency : high-frequency content words (linguistic backbone)
#   academic  : connective/explanatory words (TODO: founder curation)
#   pain      : pronunciation-difficulty words for ESL (TODO: founder curation)
#
# Each entry: { word: <lowercase>, priority: <int> }
# priority: lower = focus first when curating coverage.
# A word belongs to exactly ONE category (primary tag). Choose dominant.
"""


def main() -> int:
    out_path = Path(__file__).resolve().parents[1] / "data" / "core_vocabulary.yaml"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = [_HEADER, "", "frequency:"]
    for word in _TOP_200_FREQUENCY:
        lines.append(f"  - {{ word: {word}, priority: 100 }}")
    lines.append("")
    lines.append("# academic: words like 'therefore', 'hypothesis', 'despite', 'approximately'")
    lines.append("# Curate ~150-250 words. Founder fills in PRs.")
    lines.append("academic: []")
    lines.append("")
    lines.append("# pain: pronunciation-pain words like 'rural', 'schedule', 'temperature'")
    lines.append("# Curate ~100-200 words. Founder fills in PRs.")
    lines.append("pain: []")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path} ({len(_TOP_200_FREQUENCY)} frequency words; academic/pain empty)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the bootstrap**

Run: `python backend/scripts/bootstrap_core_vocabulary.py`
Expected: prints `Wrote .../core_vocabulary.yaml (~200 frequency words; academic/pain empty)`. File exists at `backend/data/core_vocabulary.yaml`.

- [ ] **Step 3: Verify YAML parses**

Run:

```bash
cd backend && python -c "import yaml; data = yaml.safe_load(open('data/core_vocabulary.yaml')); print({k: len(v) for k, v in data.items()})"
```

Expected: `{'frequency': 200, 'academic': 0, 'pain': 0}` (or close — exact count of `_TOP_200_FREQUENCY` list).

- [ ] **Step 4: Verify pyyaml is in requirements**

Run: `cd backend && grep -i pyyaml requirements.txt`
If absent: `echo "pyyaml>=6.0" >> requirements.txt && pip install pyyaml`.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/bootstrap_core_vocabulary.py backend/data/core_vocabulary.yaml
# also requirements.txt if modified
git commit -m "feat(coverage): bootstrap script + initial YAML with top-200 frequency"
```

---

## Task 4: Seed logic (service) + thin script entry point

Logic lives in `app/services/core_vocabulary_seed.py` so tests can import it the standard way (the existing test pattern doesn't reach into `scripts/`). The script in `scripts/seed_core_vocabulary.py` is a thin entry point.

**Files:**

- Create: `backend/app/services/core_vocabulary_seed.py`
- Create: `backend/scripts/seed_core_vocabulary.py`
- Create: `backend/tests/test_core_vocabulary_seed.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_core_vocabulary_seed.py`:

```python
"""core_vocabulary seed — YAML parse, normalization, idempotency."""
from unittest.mock import MagicMock

import pytest


def test_parse_yaml_returns_three_categories(tmp_path):
    from app.services.core_vocabulary_seed import parse_yaml
    yaml_path = tmp_path / "vocab.yaml"
    yaml_path.write_text("""
frequency:
  - { word: people, priority: 10 }
  - { word: time,   priority: 20 }
academic:
  - { word: therefore, priority: 5 }
pain: []
""")
    rows = parse_yaml(yaml_path)
    assert len(rows) == 3
    cats = {r["category"] for r in rows}
    assert cats == {"frequency", "academic"}


def test_normalize_row_lemmatizes_and_strips_punct():
    """Words go through normalize() before insert so they match pronunciation_word_index."""
    from app.services.core_vocabulary_seed import normalize_row
    row = normalize_row({"word": "Running.", "priority": 10}, category="frequency")
    # spaCy lemmatizes 'running' -> 'run'; punctuation stripped
    assert row["word"] == "run"
    assert row["category"] == "frequency"
    assert row["priority"] == 10


def test_normalize_row_rejects_stopword():
    """Stopwords from _INDEX_STOP_WORDS would never appear in the corpus index;
    inserting them would lock them as 'missing' forever. Reject loudly."""
    from app.services.core_vocabulary_seed import normalize_row
    with pytest.raises(ValueError, match="stopword"):
        normalize_row({"word": "the", "priority": 10}, category="frequency")


def test_parse_yaml_rejects_duplicate_after_normalization(tmp_path):
    """Two surface forms collapsing to the same lemma is a YAML bug."""
    from app.services.core_vocabulary_seed import parse_yaml
    yaml_path = tmp_path / "vocab.yaml"
    yaml_path.write_text("""
frequency:
  - { word: running, priority: 10 }
  - { word: ran,     priority: 20 }
academic: []
pain: []
""")
    # Both 'running' and 'ran' lemmatize to 'run'.
    with pytest.raises(ValueError, match="duplicate"):
        parse_yaml(yaml_path)


def test_seed_truncates_then_inserts():
    """TRUNCATE+INSERT semantics — YAML is the only source of truth."""
    from app.services.core_vocabulary_seed import seed_table
    client = MagicMock()
    rows = [
        {"word": "people", "category": "frequency", "priority": 10},
        {"word": "therefore", "category": "academic", "priority": 5},
    ]
    seed_table(client, rows)

    client.table.return_value.delete.return_value.neq.return_value.execute.assert_called_once()
    client.table.return_value.insert.assert_called_once_with(rows)


def test_seed_empty_rows_still_truncates():
    """Even if YAML is empty, seed clears the existing table."""
    from app.services.core_vocabulary_seed import seed_table
    client = MagicMock()
    seed_table(client, [])

    client.table.return_value.delete.return_value.neq.return_value.execute.assert_called_once()
    # insert should NOT be called with empty list (postgrest errors)
    client.table.return_value.insert.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_core_vocabulary_seed.py -v`
Expected: 6 FAIL with module not found.

- [ ] **Step 3: Implement the service module**

Create `backend/app/services/core_vocabulary_seed.py`:

```python
"""Seed logic for the core_vocabulary table.

This module owns:
  - parse_yaml(path)         — read + validate + normalize the YAML
  - normalize_row(entry, category) — single-row normalization
  - seed_table(client, rows) — TRUNCATE + INSERT into Supabase

The thin script in backend/scripts/seed_core_vocabulary.py wires these
together. Tests import from here directly.

Normalization: each word goes through normalize() (the same spaCy-based
lemmatizer used by pronunciation._tokenize_for_index) so the stored column
matches pronunciation_word_index.word 1:1.

Stopwords from _INDEX_STOP_WORDS are rejected — those never enter the
index so they'd be permanent 'missing' rows polluting coverage reports.
"""
from __future__ import annotations

from pathlib import Path

import yaml

from app.services.normalize import normalize
from app.services.pronunciation import _INDEX_STOP_WORDS


def normalize_row(entry: dict, category: str) -> dict:
    """Normalize one YAML entry into a DB row. Raises ValueError on stopword."""
    raw = str(entry["word"]).strip()
    lemma = normalize(raw, "en")
    if not lemma:
        raise ValueError(f"empty after normalization: {raw!r}")
    if lemma in _INDEX_STOP_WORDS:
        raise ValueError(
            f"{raw!r} normalizes to stopword {lemma!r} which is filtered "
            f"by _INDEX_STOP_WORDS — would be permanent missing. "
            f"Remove from YAML."
        )
    return {
        "word": lemma,
        "category": category,
        "priority": int(entry.get("priority", 100)),
    }


def parse_yaml(path: Path) -> list[dict]:
    """Read YAML and return list of normalized rows ready for insert.

    Raises ValueError on stopwords or duplicates-after-normalization."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    rows: list[dict] = []
    seen: set[str] = set()
    for category in ("frequency", "academic", "pain"):
        for entry in raw.get(category) or []:
            row = normalize_row(entry, category=category)
            if row["word"] in seen:
                raise ValueError(
                    f"duplicate word after normalization: {row['word']!r} "
                    f"(check YAML for both surface forms)"
                )
            seen.add(row["word"])
            rows.append(row)
    return rows


def seed_table(client, rows: list[dict]) -> None:
    """TRUNCATE then bulk INSERT. Idempotent.

    supabase-py doesn't expose TRUNCATE; `.delete().neq("word", "")`
    removes all rows. INSERT is skipped on empty input — postgrest errors
    on empty list payload."""
    client.table("core_vocabulary").delete().neq("word", "").execute()
    if rows:
        client.table("core_vocabulary").insert(rows).execute()
```

- [ ] **Step 4: Implement the thin script entry point**

Create `backend/scripts/seed_core_vocabulary.py`:

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_core_vocabulary_seed.py -v`
Expected: 6 PASS.

- [ ] **Step 6: Run the seed script against dev DB**

Run: `python backend/scripts/seed_core_vocabulary.py`
Expected: prints `Parsed N rows from core_vocabulary.yaml` then `Seeded core_vocabulary: N rows`. Re-run to confirm idempotent (same N, no errors).

- [ ] **Step 7: Verify rows in DB**

Run (psql or Supabase Studio):

```sql
SELECT category, COUNT(*) FROM core_vocabulary GROUP BY category;
```

Expected: `frequency = ~200`, `academic = 0`, `pain = 0`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/core_vocabulary_seed.py backend/scripts/seed_core_vocabulary.py backend/tests/test_core_vocabulary_seed.py
git commit -m "feat(coverage): seed service + thin script, normalization, idempotent"
```

---

## Task 5: Coverage service — query + status derivation

**Files:**

- Create: `backend/app/services/coverage.py`
- Create: `backend/tests/test_coverage_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_coverage_service.py`:

```python
"""Coverage service — status derivation, summary aggregation, query shape."""
from unittest.mock import MagicMock


def test_derive_status_thresholds():
    from app.services.coverage import derive_status
    assert derive_status(0) == "missing"
    assert derive_status(1) == "thin"
    assert derive_status(2) == "thin"
    assert derive_status(3) == "ok"
    assert derive_status(9) == "ok"
    assert derive_status(10) == "dense"
    assert derive_status(150) == "dense"


def test_summary_counts_by_status():
    from app.services.coverage import build_summary
    rows = [
        {"word": "a", "category": "pain", "priority": 10, "clips_count": 0,  "distinct_videos": 0},
        {"word": "b", "category": "pain", "priority": 10, "clips_count": 0,  "distinct_videos": 0},
        {"word": "c", "category": "pain", "priority": 20, "clips_count": 1,  "distinct_videos": 1},
        {"word": "d", "category": "pain", "priority": 20, "clips_count": 4,  "distinct_videos": 3},
        {"word": "e", "category": "pain", "priority": 20, "clips_count": 30, "distinct_videos": 12},
    ]
    summary = build_summary(rows)
    assert summary == {
        "total_words": 5,
        "missing": 2,
        "thin": 1,
        "ok": 1,
        "dense": 1,
    }


def test_attach_status_appends_status_field():
    from app.services.coverage import attach_status
    rows = [
        {"word": "a", "clips_count": 0},
        {"word": "b", "clips_count": 5},
    ]
    enriched = attach_status(rows)
    assert enriched[0]["status"] == "missing"
    assert enriched[1]["status"] == "ok"
    # Original fields preserved
    assert enriched[0]["word"] == "a"


def test_filter_rows_by_category():
    from app.services.coverage import filter_rows
    rows = [
        {"word": "a", "category": "pain"},
        {"word": "b", "category": "academic"},
    ]
    out = filter_rows(rows, category="pain", status=None)
    assert len(out) == 1
    assert out[0]["word"] == "a"


def test_filter_rows_by_status():
    from app.services.coverage import filter_rows
    rows = [
        {"word": "a", "status": "missing"},
        {"word": "b", "status": "ok"},
    ]
    out = filter_rows(rows, category=None, status="missing")
    assert len(out) == 1
    assert out[0]["word"] == "a"


def test_fetch_coverage_rows_query_shape():
    """Calls Supabase RPC with the join — verify the call surface."""
    from app.services.coverage import fetch_coverage_rows
    client = MagicMock()
    client.rpc.return_value.execute.return_value.data = [
        {"word": "x", "category": "frequency", "priority": 10,
         "clips_count": 5, "distinct_videos": 3},
    ]
    rows = fetch_coverage_rows(client)
    assert len(rows) == 1
    assert rows[0]["word"] == "x"
    client.rpc.assert_called_once()
    call_args = client.rpc.call_args
    assert call_args[0][0] == "coverage_rows"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_coverage_service.py -v`
Expected: 6 FAIL with module not found.

- [ ] **Step 3: Add SQL function for the JOIN query**

Append to `supabase/migrations/00000000000021_core_vocabulary.sql`:

```sql
-- -------------------------------------------------------------------------
-- coverage_rows() RPC — single source of the JOIN against
-- pronunciation_word_index. Used by both the API endpoint and the CLI.
-- Returns one row per core_vocabulary entry with clip counts.
-- -------------------------------------------------------------------------
create or replace function public.coverage_rows()
returns table (
    word text,
    category text,
    priority int,
    clips_count bigint,
    distinct_videos bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        cv.word,
        cv.category,
        cv.priority,
        count(wi.clip_id)::bigint as clips_count,
        count(distinct pc.video_id)::bigint as distinct_videos
    from public.core_vocabulary cv
    left join public.pronunciation_word_index wi on wi.word = cv.word
    left join public.pronunciation_clips pc on pc.id = wi.clip_id
    group by cv.word, cv.category, cv.priority
    order by clips_count asc, cv.category, cv.priority;
$$;

revoke all on function public.coverage_rows() from public;
grant execute on function public.coverage_rows() to service_role;
```

Re-apply the migration: `python backend/scripts/apply_migration_21.py` (idempotent via `create or replace`).

- [ ] **Step 4: Implement the service**

Create `backend/app/services/coverage.py`:

```python
"""Coverage service — derives status from clip counts, fetches rows from
Postgres via the coverage_rows() RPC, aggregates summaries.

This module has no FastAPI / HTTP coupling. Both the API endpoint and the
CLI consume it directly.
"""
from __future__ import annotations

from typing import Iterable, Literal

Status = Literal["missing", "thin", "ok", "dense"]

_OK_THRESHOLD = 3
_DENSE_THRESHOLD = 10


def derive_status(clips_count: int) -> Status:
    if clips_count == 0:
        return "missing"
    if clips_count < _OK_THRESHOLD:
        return "thin"
    if clips_count < _DENSE_THRESHOLD:
        return "ok"
    return "dense"


def attach_status(rows: Iterable[dict]) -> list[dict]:
    """Return a NEW list of rows with `status` field appended."""
    out: list[dict] = []
    for row in rows:
        enriched = dict(row)
        enriched["status"] = derive_status(int(row.get("clips_count") or 0))
        out.append(enriched)
    return out


def build_summary(rows: Iterable[dict]) -> dict:
    """Aggregate counts by status. Expects rows WITHOUT a `status` field
    (we derive it here so summary is always self-consistent)."""
    summary = {"total_words": 0, "missing": 0, "thin": 0, "ok": 0, "dense": 0}
    for row in rows:
        summary["total_words"] += 1
        status = derive_status(int(row.get("clips_count") or 0))
        summary[status] += 1
    return summary


def filter_rows(
    rows: Iterable[dict],
    category: str | None,
    status: str | None,
) -> list[dict]:
    """Server-side filtering. Both filters are AND."""
    out = list(rows)
    if category:
        out = [r for r in out if r.get("category") == category]
    if status:
        out = [r for r in out if r.get("status") == status]
    return out


def fetch_coverage_rows(client) -> list[dict]:
    """Call the Postgres function. Returns enriched rows (with status).

    The RPC handles the JOIN — keeps the heavy lifting in the DB and gives
    us a single source of truth for the query."""
    res = client.rpc("coverage_rows", {}).execute()
    raw = res.data or []
    return attach_status(raw)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_coverage_service.py -v`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/coverage.py backend/tests/test_coverage_service.py supabase/migrations/00000000000021_core_vocabulary.sql
git commit -m "feat(coverage): service module + coverage_rows() RPC"
```

---

## Task 6: Coverage endpoint

**Files:**

- Create: `backend/app/api/v1/coverage.py`
- Create: `backend/tests/test_coverage_api.py`
- Modify: `backend/app/main.py` (register router)

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_coverage_api.py`:

```python
"""Coverage endpoint — auth gating, response shape, query params."""
from unittest.mock import MagicMock, patch


def test_coverage_endpoint_returns_summary_and_rows(monkeypatch):
    """Happy path with admin user."""
    from fastapi.testclient import TestClient
    from app.main import app

    fake_rows = [
        {"word": "rural", "category": "pain", "priority": 10,
         "clips_count": 0, "distinct_videos": 0},
        {"word": "people", "category": "frequency", "priority": 100,
         "clips_count": 50, "distinct_videos": 20},
    ]

    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u1"), \
         patch("app.api.v1.coverage.fetch_coverage_rows", return_value=[
             {**r, "status": "missing" if r["clips_count"] == 0 else "dense"}
             for r in fake_rows
         ]):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"]["total_words"] == 2
    assert body["summary"]["missing"] == 1
    assert body["summary"]["dense"] == 1
    assert len(body["rows"]) == 2
    assert body["rows"][0]["status"] in {"missing", "thin", "ok", "dense"}


def test_coverage_endpoint_rejects_non_admin(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u_other"):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 403


def test_coverage_endpoint_filters_by_category(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    rows = [
        {"word": "a", "category": "pain",      "priority": 1, "clips_count": 0, "distinct_videos": 0, "status": "missing"},
        {"word": "b", "category": "academic",  "priority": 1, "clips_count": 0, "distinct_videos": 0, "status": "missing"},
    ]
    monkeypatch.setattr("app.core.admin_auth.settings.ADMIN_USER_IDS", "u1")
    with patch("app.api.v1.coverage.get_current_user_id", return_value="u1"), \
         patch("app.api.v1.coverage.fetch_coverage_rows", return_value=rows):
        client = TestClient(app)
        resp = client.get(
            "/api/v1/admin/coverage?category=pain",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["rows"]) == 1
    assert body["rows"][0]["category"] == "pain"
    # Summary stays GLOBAL (over all rows, not the filtered subset) so the
    # founder always sees full corpus health.
    assert body["summary"]["total_words"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_coverage_api.py -v`
Expected: 3 FAIL with module not found.

- [ ] **Step 3: Implement the endpoint**

Create `backend/app/api/v1/coverage.py`:

```python
"""GET /api/v1/admin/coverage — corpus coverage instrument (admin-only).

NOT a product API. Internal observation tool for the founder. No caching,
no rate limiting, no SLA. Auth-gated via ADMIN_USER_IDS whitelist.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.admin_auth import require_admin
from app.core.auth import get_current_user_id  # noqa: F401  (referenced by tests via patch)
from app.db.supabase_client import get_admin_client
from app.services.coverage import (
    build_summary,
    fetch_coverage_rows,
    filter_rows,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin", "coverage"])


@router.get("/coverage")
def get_coverage(
    category: Optional[str] = Query(None, regex="^(frequency|academic|pain)$"),
    status: Optional[str] = Query(None, regex="^(missing|thin|ok|dense)$"),
    _: str = Depends(require_admin),
) -> dict:
    client = get_admin_client()
    enriched_rows = fetch_coverage_rows(client)
    # Summary always reflects the WHOLE corpus, not the filtered subset.
    summary = build_summary(enriched_rows)
    rows = filter_rows(enriched_rows, category=category, status=status)
    return {"summary": summary, "rows": rows}
```

- [ ] **Step 4: Register the router**

Modify `backend/app/main.py`. Find the import block for routers and add `coverage`:

```python
# In the imports section near other route imports:
from app.api.v1 import (
    books, bookmarks, captures, cards, coverage, decks, dictionary,
    highlights, internal, pronounce, reviews, stats, translate, videos,
)
```

(Verify the exact import structure first — if routers are imported individually, add an individual import.)

Then in the include section (around line 142):

```python
app.include_router(coverage.router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_coverage_api.py -v`
Expected: 3 PASS.

- [ ] **Step 6: Smoke test against dev**

Run the backend (`uvicorn app.main:app --reload`), set `ADMIN_USER_IDS=<your-supabase-user-id>` in `.env`, then:

```bash
TOKEN="<paste your supabase JWT>"
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/admin/coverage | jq .summary
```

Expected: JSON with `total_words`, `missing`, `thin`, `ok`, `dense` counts. Without the JWT or with non-admin user_id, expect 401/403.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/coverage.py backend/tests/test_coverage_api.py backend/app/main.py
git commit -m "feat(coverage): admin endpoint GET /api/v1/admin/coverage"
```

---

## Task 7: CLI show_coverage.py — tabular output

**Files:**

- Create: `backend/scripts/show_coverage.py`

- [ ] **Step 1: Implement the CLI**

Create `backend/scripts/show_coverage.py`:

```python
"""CLI: tabular view of pronounce corpus coverage against core_vocabulary.

Direct DB consumer (does NOT call the API endpoint) — same query, no auth
hop. For founder/operator use from terminal.

Examples:
    python scripts/show_coverage.py
    python scripts/show_coverage.py --category pain
    python scripts/show_coverage.py --status missing --top 30
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add backend/ to import path.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND_ROOT))

from app.db.supabase_client import get_admin_client  # noqa: E402
from app.services.coverage import (  # noqa: E402
    build_summary,
    fetch_coverage_rows,
    filter_rows,
)


def _print_summary(summary: dict, by_category: dict) -> None:
    print(f"Coverage radar")
    print()
    print(f"Category    | Total | Missing | Thin | OK   | Dense")
    print(f"------------|-------|---------|------|------|------")
    for cat in ("frequency", "academic", "pain"):
        s = by_category.get(cat, {"total_words": 0, "missing": 0, "thin": 0, "ok": 0, "dense": 0})
        print(
            f"{cat:<11} | {s['total_words']:>5} | {s['missing']:>7} | "
            f"{s['thin']:>4} | {s['ok']:>4} | {s['dense']:>5}"
        )
    print()
    print(
        f"TOTAL: {summary['total_words']} words "
        f"({summary['missing']} missing, {summary['thin']} thin, "
        f"{summary['ok']} ok, {summary['dense']} dense)"
    )


def _print_rows(rows: list[dict], top: int) -> None:
    if not rows:
        print()
        print("No rows match the filter.")
        return
    print()
    print(f"Top gaps (showing {min(top, len(rows))} of {len(rows)}):")
    print()
    print(f"  {'word':<20} {'category':<10} {'status':<8} {'clips':>5} {'videos':>6}")
    for row in rows[:top]:
        print(
            f"  {row['word']:<20} {row['category']:<10} "
            f"{row['status']:<8} {row['clips_count']:>5} {row['distinct_videos']:>6}"
        )


def _summary_per_category(rows: list[dict]) -> dict:
    """Group enriched rows by category and build summary for each."""
    by_cat: dict = {}
    for row in rows:
        cat = row["category"]
        by_cat.setdefault(cat, []).append(row)
    return {cat: build_summary(group) for cat, group in by_cat.items()}


def main() -> int:
    p = argparse.ArgumentParser(description="Pronounce corpus coverage radar")
    p.add_argument("--category", choices=["frequency", "academic", "pain"])
    p.add_argument("--status", choices=["missing", "thin", "ok", "dense"])
    p.add_argument("--top", type=int, default=20, help="rows to show (default 20)")
    args = p.parse_args()

    client = get_admin_client()
    all_rows = fetch_coverage_rows(client)
    if not all_rows:
        print("core_vocabulary table is empty. Run scripts/seed_core_vocabulary.py first.")
        return 1

    by_category = _summary_per_category(all_rows)
    summary = build_summary(all_rows)
    _print_summary(summary, by_category)

    filtered = filter_rows(all_rows, category=args.category, status=args.status)
    _print_rows(filtered, args.top)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Smoke test against dev DB**

Run:

```bash
python backend/scripts/show_coverage.py
python backend/scripts/show_coverage.py --status missing --top 10
python backend/scripts/show_coverage.py --category frequency
```

Expected:

- First command: shows the summary table by category + top 20 rows by lowest clips_count
- `--status missing`: only words with 0 clips, top 10
- `--category frequency`: only frequency-category rows

If `core_vocabulary` is empty, expect the "table is empty" message.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/show_coverage.py
git commit -m "feat(coverage): CLI show_coverage.py with tabular output"
```

---

## Task 8: End-to-end verification

This task has no code — it's the final smoke check that the whole flow works against real data.

- [ ] **Step 1: Verify coverage matches reality on a few words**

Pick 3 words from `core_vocabulary.yaml` (e.g., "people", "world", "experience"). For each:

1. Query `pronunciation_word_index`:

```sql
SELECT count(*) FROM pronunciation_word_index WHERE word = 'people';
```

2. Run `python backend/scripts/show_coverage.py --top 200 | grep -i people`
3. Confirm the `clips` column matches the SQL count.

- [ ] **Step 2: Verify endpoint matches CLI**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/api/v1/admin/coverage \
  | jq '.rows[] | select(.word == "people")'
```

Expected: same `clips_count` and `distinct_videos` as the CLI shows for "people".

- [ ] **Step 3: Verify a `missing` example renders correctly**

Add `rural` to the `pain` section of `core_vocabulary.yaml` (since it's likely 0 clips in your corpus). Re-run seed:

```bash
python backend/scripts/seed_core_vocabulary.py
python backend/scripts/show_coverage.py --status missing
```

Expected: `rural` appears with `clips_count = 0` and `status = missing`.

If yes — V0 ships. The instrument shows real corpus gaps and the founder's manual workflow (find video → ingest → re-check) closes them.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
# Only if there are uncommitted changes from the smoke test
git status
git add -p   # interactive, only commit cleanup
git commit -m "chore(coverage): final cleanup after E2E verification"
```

---

## Self-Review Checklist

After completing all 8 tasks:

**Spec coverage:**

- §3 three-layer vocabulary (frequency/academic/pain): ✅ Task 1 (DDL constraint) + Task 3 (YAML structure) + Task 4 (seed)
- §4.1 YAML in repo: ✅ Task 3 (bootstrap) generates it
- §4.2 SQL table: ✅ Task 1 (migration)
- §4.3 reload mechanism (TRUNCATE+INSERT): ✅ Task 4 (seed_table function)
- §5.1 query base: ✅ Task 5 (coverage_rows RPC)
- §5.2 thresholds (0/1-2/3-9/10+): ✅ Task 5 (derive_status with constants)
- §5.3 endpoint admin-gated, no caching: ✅ Tasks 2 + 6
- §5.4 CLI tabular: ✅ Task 7
- §6 workflow doc: covered in spec, no code change required
- §8 open questions resolved: bootstrap script (Option B) implemented in Task 3, normalization handled in Task 4 (raises on stopword), tests cover idempotency / status / auth / empty corpus

**Placeholder scan:** none — all code blocks are complete.

**Type consistency:** `derive_status` / `build_summary` / `attach_status` / `filter_rows` / `fetch_coverage_rows` signatures match between Tasks 5, 6, 7. `seed_table` and `parse_yaml` match between Task 4 implementation and tests.

**Threshold constants:** `_OK_THRESHOLD = 3` and `_DENSE_THRESHOLD = 10` defined once in `coverage.py`, consumed by all callers.

---

## Test Coverage Summary

| Test file | What it covers |
| --- | --- |
| `test_admin_auth.py` | Whitelist parsing, allow/reject, empty-whitelist fail-closed |
| `test_core_vocabulary_seed.py` | YAML parse, normalization to lemma, stopword rejection, duplicate-after-normalization rejection, TRUNCATE+INSERT, empty input |
| `test_coverage_service.py` | derive_status thresholds, summary aggregation, attach_status, filter_rows, fetch_coverage_rows query shape |
| `test_coverage_api.py` | Admin gating (200 vs 403), response shape, category filter applied to rows but not summary |

End-to-end smoke (Task 8) closes the loop: real data flows through SQL → service → endpoint and CLI consistently.
