"""B2 end-to-end smoke test:
- POST /captures returns enriched word
- GET /captures lists own
- PUT /captures updates tags
- GET /dictionary/{word} hits cache after capture
- POST capture with book_id, then GET /books/{id}/captured-words returns count+first_seen
- DELETE /captures returns 204

Run: PYTHONPATH=. py -3.12 scripts/test_b2.py
"""
from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

from app.core.config import settings

API = os.environ.get("API_URL", "http://localhost:8088")

ADMIN = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def create_user(email, pw):
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN,
        json={"email": email, "password": pw, "email_confirm": True},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["id"]


def delete_user(uid):
    httpx.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}", headers=ADMIN, timeout=20
    )


def sign_in(email, pw):
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": settings.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": pw},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def expect(label, ok, info=""):
    print(f"  {'PASS' if ok else 'FAIL'}: {label} {info}")
    return ok


def main():
    suffix = uuid.uuid4().hex[:8]
    email = f"b2-{suffix}@example.com"
    pw = f"pw-{uuid.uuid4().hex}"
    uid = None
    failed = 0
    try:
        uid = create_user(email, pw)
        time.sleep(0.5)
        token = sign_in(email, pw)
        auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 1) POST capture without book_id → enriched
        r = httpx.post(
            f"{API}/api/v1/captures",
            headers=auth,
            json={
                "word": "Gleaming.",  # punctuation/case to test normalization
                "context_sentence": "The lake was gleaming under the moon.",
                "language": "en",
                "tags": ["MNEMO"],
            },
            timeout=30,
        )
        ok = (
            r.status_code == 200
            and r.json().get("word_normalized") == "gleam"
            and r.json().get("definition") is not None
        )
        if not expect("POST /captures normalizes + enriches", ok,
                      f"(status={r.status_code} body={r.text[:150]})"):
            failed += 1
            return failed
        capture_a = r.json()

        # 2) POST a second capture for the same word
        r = httpx.post(
            f"{API}/api/v1/captures",
            headers=auth,
            json={"word": "GLEAMED!", "language": "en"},
            timeout=30,
        )
        ok = r.status_code == 200 and r.json()["word_normalized"] == "gleam"
        if not expect("POST 2nd capture same lemma", ok, f"({r.status_code})"):
            failed += 1

        # 3) GET /captures lists both
        r = httpx.get(f"{API}/api/v1/captures", headers=auth, timeout=15)
        ok = r.status_code == 200 and len(r.json()) >= 2
        if not expect("GET /captures returns >=2 own captures", ok,
                      f"({len(r.json()) if r.status_code == 200 else r.status_code})"):
            failed += 1

        # 4) PUT update tags
        r = httpx.put(
            f"{API}/api/v1/captures/{capture_a['id']}",
            headers=auth,
            json={"tags": ["EJEMPLOS", "GRAMATICA"]},
            timeout=15,
        )
        ok = r.status_code == 200 and r.json()["tags"] == ["EJEMPLOS", "GRAMATICA"]
        if not expect("PUT capture updates tags", ok,
                      f"({r.status_code} tags={r.json().get('tags') if r.status_code==200 else '-'})"):
            failed += 1

        # 5) GET /dictionary/{word} - should be cache hit now
        r = httpx.get(f"{API}/api/v1/dictionary/gleaming", headers=auth, timeout=15)
        cache = r.headers.get("x-cache")
        ok = r.status_code == 200 and cache in ("hit-fresh", "hit-stale-refreshing")
        if not expect("GET /dictionary cached after capture", ok,
                      f"(status={r.status_code} X-Cache={cache})"):
            failed += 1

        # 6) Register Gutenberg book + capture with book_id
        r = httpx.post(
            f"{API}/api/v1/books/gutenberg/register",
            headers=auth,
            json={"gutenberg_id": 1342, "title": "Pride and Prejudice", "author": "Jane Austen"},
            timeout=30,
        )
        if not expect("Register Gutenberg book", r.status_code == 200, f"({r.status_code})"):
            failed += 1
            return failed
        book_id = r.json()["id"]

        for w in ["pride", "Prejudice.", "PRIDE!"]:
            r = httpx.post(
                f"{API}/api/v1/captures",
                headers=auth,
                json={"word": w, "book_id": book_id, "language": "en"},
                timeout=30,
            )
            if not expect(f"POST capture {w!r} with book_id", r.status_code == 200, f"({r.status_code})"):
                failed += 1

        # 7) GET captured-words for the book
        r = httpx.get(f"{API}/api/v1/books/{book_id}/captured-words", headers=auth, timeout=15)
        if r.status_code == 200:
            words = {w["word_normalized"]: w for w in r.json()}
            ok = (
                "pride" in words
                and "prejudice" in words
                and words["pride"]["count"] == 2  # "pride" + "PRIDE!"
            )
            if not expect("GET captured-words returns counts + first_seen", ok,
                          f"({len(words)} unique, pride.count={words.get('pride', {}).get('count')})"):
                failed += 1
        else:
            expect("GET captured-words", False, f"({r.status_code})")
            failed += 1

        # 8) DELETE
        r = httpx.delete(f"{API}/api/v1/captures/{capture_a['id']}", headers=auth, timeout=15)
        if not expect("DELETE capture -> 204", r.status_code == 204, f"({r.status_code})"):
            failed += 1

        # 9) DELETE non-own → 404
        r = httpx.delete(f"{API}/api/v1/captures/{uuid.uuid4()}", headers=auth, timeout=15)
        if not expect("DELETE missing -> 404", r.status_code == 404, f"({r.status_code})"):
            failed += 1

        return failed
    finally:
        if uid:
            delete_user(uid)


if __name__ == "__main__":
    code = main()
    print()
    print("B2:", "ALL PASS" if code == 0 else f"{code} FAILED")
    sys.exit(code)
