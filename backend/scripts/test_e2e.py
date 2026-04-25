"""
End-to-end smoke test:
- Creates a user via Supabase admin API
- Signs in to get a real JWT (ES256)
- Calls FastAPI /api/v1/me        -> verifies JWKS-based JWT verify works
- Calls /api/v1/books/search      -> verifies Gutendex proxy
- Calls /api/v1/books/gutenberg/register -> verifies admin client + RLS bypass
- Calls /api/v1/books/{id}/progress      -> verifies upsert
- Cleans up

Run: PYTHONPATH=. py -3.11 -m poetry run python scripts/test_e2e.py
"""
from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

from app.core.config import settings

API = os.environ.get("API_URL", "http://localhost:8088")

ADMIN_HEADERS = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def create_user(email: str, password: str) -> str:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN_HEADERS,
        json={"email": email, "password": password, "email_confirm": True},
        timeout=20.0,
    )
    r.raise_for_status()
    return r.json()["id"]


def delete_user(user_id: str) -> None:
    httpx.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=ADMIN_HEADERS,
        timeout=20.0,
    )


def sign_in(email: str, password: str) -> str:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password},
        timeout=20.0,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def expect(label: str, ok: bool, info: str = "") -> bool:
    print(f"  {'PASS' if ok else 'FAIL'}: {label} {info}")
    return ok


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    email = f"e2e-{suffix}@example.com"
    password = f"pw-{uuid.uuid4().hex}"

    user_id = None
    failed = 0
    try:
        print(f"Creating user {email}...")
        user_id = create_user(email, password)
        time.sleep(0.5)
        token = sign_in(email, password)
        auth = {"Authorization": f"Bearer {token}"}

        # 1) /api/v1/me with real JWT
        r = httpx.get(f"{API}/api/v1/me", headers=auth, timeout=15)
        if not expect(
            "GET /api/v1/me",
            r.status_code == 200 and r.json().get("user_id") == user_id,
            f"(status={r.status_code} body={r.text[:120]})",
        ):
            failed += 1

        # 2) /api/v1/me unauthorized -> 401
        r = httpx.get(f"{API}/api/v1/me", timeout=15)
        if not expect("GET /api/v1/me without token -> 4xx", r.status_code in (401, 422)):
            failed += 1

        # 3) Gutendex search
        r = httpx.get(
            f"{API}/api/v1/books/search",
            params={"q": "sherlock holmes"},
            headers=auth,
            timeout=30,
        )
        if not expect(
            "GET /api/v1/books/search",
            r.status_code == 200 and len(r.json().get("results", [])) > 0,
            f"({len(r.json().get('results', []))} results)" if r.status_code == 200 else f"({r.status_code})",
        ):
            failed += 1

        # 4) Register Gutenberg book
        gutenberg_id = 1661  # Adventures of Sherlock Holmes
        r = httpx.post(
            f"{API}/api/v1/books/gutenberg/register",
            headers={**auth, "Content-Type": "application/json"},
            json={
                "gutenberg_id": gutenberg_id,
                "title": "The Adventures of Sherlock Holmes",
                "author": "Arthur Conan Doyle",
            },
            timeout=30,
        )
        ok = r.status_code == 200 and "id" in r.json()
        if not expect(
            "POST /api/v1/books/gutenberg/register",
            ok,
            f"(status={r.status_code} body={r.text[:120]})",
        ):
            failed += 1
            return failed

        book_id = r.json()["id"]

        # 5) Update progress
        r = httpx.put(
            f"{API}/api/v1/books/{book_id}/progress",
            headers={**auth, "Content-Type": "application/json"},
            json={"location": "epubcfi(/6/4)", "percent": 12.5},
            timeout=15,
        )
        if not expect(
            "PUT /api/v1/books/{id}/progress",
            r.status_code == 200 and r.json().get("ok") is True,
            f"(status={r.status_code})",
        ):
            failed += 1

        # 6) Get epub URL
        r = httpx.get(
            f"{API}/api/v1/books/{gutenberg_id}/epub-url",
            headers=auth,
            timeout=15,
        )
        if not expect(
            "GET /api/v1/books/{gid}/epub-url",
            r.status_code == 200 and r.json().get("url", "").endswith(".epub.images"),
        ):
            failed += 1

        return failed
    finally:
        if user_id:
            print(f"Cleanup user {user_id}")
            delete_user(user_id)


if __name__ == "__main__":
    code = main()
    print()
    print("E2E:", "ALL PASS" if code == 0 else f"{code} FAILED")
    sys.exit(code)
