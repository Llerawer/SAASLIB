"""Re-tokenize all pronunciation_clips into pronunciation_word_index.

Used after a stopwords-list change. Doesn't re-download anything from
YouTube — just runs the new tokenizer over each clip's already-stored
sentence_text and rewrites the index.

Usage:
    PYTHONPATH=. py -3.11 -m poetry run python scripts/reindex_pronunciation_words.py
"""
from __future__ import annotations

from app.db.supabase_client import get_admin_client
from app.services.pronunciation import _tokenize_for_index


BATCH = 500


def main() -> int:
    client = get_admin_client()

    print("[reindex] counting clips...")
    total = (
        client.table("pronunciation_clips")
        .select("id", count="exact")
        .limit(1)
        .execute()
        .count
    )
    print(f"[reindex] {total} clips to process")

    print("[reindex] wiping pronunciation_word_index...")
    # Use a non-trivial filter so the row delete is allowed.
    client.table("pronunciation_word_index").delete().neq("clip_id", "00000000-0000-0000-0000-000000000000").execute()

    rebuilt_rows = 0
    offset = 0
    while offset < total:
        page = (
            client.table("pronunciation_clips")
            .select("id, sentence_text")
            .range(offset, offset + BATCH - 1)
            .execute()
            .data
        )
        if not page:
            break

        index_rows: list[dict] = []
        for clip in page:
            tokens = _tokenize_for_index(clip["sentence_text"])
            index_rows.extend(
                {"clip_id": clip["id"], "word": t} for t in tokens
            )

        if index_rows:
            # Chunk inserts to avoid huge single payloads.
            for i in range(0, len(index_rows), 1000):
                chunk = index_rows[i : i + 1000]
                client.table("pronunciation_word_index").insert(chunk).execute()
            rebuilt_rows += len(index_rows)

        offset += BATCH
        print(
            f"[reindex] processed {min(offset, total)}/{total} clips -> "
            f"{rebuilt_rows} index rows so far"
        )

    print()
    print("===== SUMMARY =====")
    print(f"  clips processed:     {total}")
    print(f"  word_index rebuilt:  {rebuilt_rows}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
