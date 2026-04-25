"""
RLS sanity check.

Creates two test users, inserts a capture as user A, then tries to read
A's captures as user B (must get 0 rows). Cleans up after.

Run: py -3.11 -m poetry run python scripts/test_rls.py
"""
from __future__ import annotations

import sys
import time
import uuid

import httpx

from app.core.config import settings

ADMIN_HEADERS = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def admin_create_user(email: str, password: str) -> str:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN_HEADERS,
        json={"email": email, "password": password, "email_confirm": True},
        timeout=20.0,
    )
    r.raise_for_status()
    return r.json()["id"]


def admin_delete_user(user_id: str) -> None:
    r = httpx.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers=ADMIN_HEADERS,
        timeout=20.0,
    )
    if r.status_code not in (200, 204):
        print(f"  WARN: delete {user_id} -> {r.status_code} {r.text[:120]}")


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


def insert_capture(token: str, user_id: str, word: str) -> dict:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/rest/v1/captures",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={
            "user_id": user_id,
            "word": word,
            "word_normalized": word.lower(),
            "context_sentence": "Test sentence for RLS check.",
        },
        timeout=20.0,
    )
    if r.status_code >= 400:
        print(f"  insert_capture {r.status_code}: {r.text[:300]}")
    r.raise_for_status()
    return r.json()[0]


def attempt_inject(token: str, victim_user_id: str, word: str) -> int:
    """Try to insert a capture spoofing user_id = victim. Should be 403."""
    r = httpx.post(
        f"{settings.SUPABASE_URL}/rest/v1/captures",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={
            "user_id": victim_user_id,
            "word": word,
            "word_normalized": word.lower(),
        },
        timeout=20.0,
    )
    return r.status_code


def list_captures(token: str) -> list[dict]:
    r = httpx.get(
        f"{settings.SUPABASE_URL}/rest/v1/captures?select=*",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {token}",
        },
        timeout=20.0,
    )
    r.raise_for_status()
    return r.json()


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    email_a = f"rls-test-a-{suffix}@example.com"
    email_b = f"rls-test-b-{suffix}@example.com"
    password = f"pw-{uuid.uuid4().hex}"

    user_a = user_b = None
    try:
        print(f"Creating user A ({email_a})…")
        user_a = admin_create_user(email_a, password)
        print(f"Creating user B ({email_b})…")
        user_b = admin_create_user(email_b, password)

        time.sleep(1)  # let triggers settle

        print("Signing in as A and B…")
        token_a = sign_in(email_a, password)
        token_b = sign_in(email_b, password)

        print("Inserting capture as A (own user_id)…")
        cap = insert_capture(token_a, user_a, f"gleaming-{suffix}")
        assert cap["user_id"] == user_a, "RLS: user_id mismatch on insert"

        print("Reading own captures as A (expect >=1)…")
        own = list_captures(token_a)
        assert any(c["id"] == cap["id"] for c in own), (
            f"RLS BROKEN: A cannot read own capture (got {len(own)} rows)"
        )

        print("Reading captures as B (expect 0 of A's rows)…")
        seen_by_b = list_captures(token_b)
        leaked = [c for c in seen_by_b if c["user_id"] == user_a]
        if leaked:
            print(f"FAIL RLS BROKEN: B sees {len(leaked)} of A's captures.")
            return 1

        print("Trying to spoof user_id as B inserting under A (expect 4xx)…")
        spoof_status = attempt_inject(token_b, user_a, f"spoof-{suffix}")
        if spoof_status < 400:
            print(f"FAIL RLS BROKEN: B successfully inserted under A's user_id (HTTP {spoof_status})")
            return 1

        print(
            f"OK: RLS OK — B sees 0 of A's captures (total visible: {len(seen_by_b)}); "
            f"spoof attempt blocked with HTTP {spoof_status}."
        )
        return 0
    finally:
        if user_a:
            print(f"Cleanup user A {user_a}")
            admin_delete_user(user_a)
        if user_b:
            print(f"Cleanup user B {user_b}")
            admin_delete_user(user_b)


if __name__ == "__main__":
    sys.exit(main())
