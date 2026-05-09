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

    # dict.fromkeys preserves insertion order while deduplicating —
    # the curated _TOP_200_FREQUENCY list has a few accidental repeats
    # ("work", "right", "use" appear twice) that the seed script would
    # reject as duplicates-after-normalization. Dedupe here keeps the
    # source list readable and the output clean.
    unique_words = list(dict.fromkeys(_TOP_200_FREQUENCY))
    lines: list[str] = [_HEADER, "", "frequency:"]
    for word in unique_words:
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
    print(f"Wrote {out_path} ({len(unique_words)} frequency words; academic/pain empty)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
