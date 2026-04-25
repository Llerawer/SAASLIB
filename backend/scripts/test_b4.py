"""B4 E2E: cards endpoints + promote-from-captures dedup behavior.

Run from repo root with:
PYTHONPATH=C:/Users/GERARDO/saas/backend py -3.12 backend/scripts/test_b4.py
"""
from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

# When run from elsewhere, ensure config can find backend/.env.
import os as _os
_os.chdir(r"C:\Users\GERARDO\saas\backend")

from app.core.config import settings  # noqa: E402

API = os.environ.get("API_URL", "http://localhost:8091")
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
    email = f"b4-{suffix}@example.com"
    pw = uuid.uuid4().hex
    uid = None
    failed = 0
    try:
        uid = create_user(email, pw)
        time.sleep(0.5)
        token = sign_in(email, pw)
        auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 1) Capture 3 forms of the same lemma → 3 captures, 1 lemma
        captures = []
        for w in ["Gleaming.", "GLEAMED!", "gleam,"]:
            r = httpx.post(
                f"{API}/api/v1/captures",
                headers=auth,
                json={"word": w, "language": "en"},
                timeout=30,
            )
            if r.status_code != 200:
                expect(f"Capture {w!r}", False, f"({r.status_code})")
                return failed + 1
            captures.append(r.json())

        # 2) Promote them → expect 1 card created (dedup), 0 merged
        capture_ids = [c["id"] for c in captures]
        r = httpx.post(
            f"{API}/api/v1/cards/promote-from-captures",
            headers=auth,
            json={"capture_ids": capture_ids},
            timeout=30,
        )
        ok = (
            r.status_code == 200
            and r.json()["created_count"] == 1
            and r.json()["merged_count"] == 0
            and len(r.json()["cards"]) == 1
        )
        if not expect(
            "Promote 3 same-lemma captures -> 1 card",
            ok,
            f"(status={r.status_code} body={r.text[:200]})",
        ):
            failed += 1
            return failed

        card = r.json()["cards"][0]
        if not expect(
            "Card has source_capture_ids with 3 entries",
            len(card["source_capture_ids"]) == 3,
        ):
            failed += 1

        if not expect(
            "Card lemma is 'gleam'",
            card["word_normalized"] == "gleam",
        ):
            failed += 1

        # 3) GET /captures with promoted=true → all 3 marked
        r = httpx.get(
            f"{API}/api/v1/captures?promoted=true",
            headers=auth,
            timeout=15,
        )
        ok = r.status_code == 200 and len(r.json()) == 3
        if not expect(
            "GET captures?promoted=true returns 3",
            ok,
            f"({len(r.json()) if r.status_code == 200 else r.status_code})",
        ):
            failed += 1

        # 4) Capture another lemma + promote with the existing one → merge
        r = httpx.post(
            f"{API}/api/v1/captures",
            headers=auth,
            json={"word": "gleaming again", "language": "en"},  # normalizes back to "gleam"
            timeout=30,
        )
        if r.status_code != 200:
            # The full string normalizes weirdly, try a safer one.
            pass

        # Capture more "gleam" forms and another lemma "shine"
        r1 = httpx.post(f"{API}/api/v1/captures", headers=auth,
                        json={"word": "gleams", "language": "en"}, timeout=30).json()
        r2 = httpx.post(f"{API}/api/v1/captures", headers=auth,
                        json={"word": "shining", "language": "en"}, timeout=30).json()

        r = httpx.post(
            f"{API}/api/v1/cards/promote-from-captures",
            headers=auth,
            json={"capture_ids": [r1["id"], r2["id"]]},
            timeout=30,
        )
        ok = (
            r.status_code == 200
            and r.json()["created_count"] == 1   # "shine" is new
            and r.json()["merged_count"] == 1    # "gleam" merges
        )
        if not expect(
            "2nd promote: 1 merged + 1 created",
            ok,
            f"(c={r.json().get('created_count')} m={r.json().get('merged_count')})",
        ):
            failed += 1

        # 5) GET /cards lists 2
        r = httpx.get(f"{API}/api/v1/cards", headers=auth, timeout=15)
        ok = r.status_code == 200 and len(r.json()) == 2
        if not expect(
            "GET /cards returns 2",
            ok,
            f"({len(r.json()) if r.status_code == 200 else r.status_code})",
        ):
            failed += 1

        # 6) PUT card edit
        r = httpx.put(
            f"{API}/api/v1/cards/{card['id']}",
            headers=auth,
            json={"mnemonic": "Like a lake reflecting moonlight", "cefr": "B2"},
            timeout=15,
        )
        ok = (
            r.status_code == 200
            and r.json()["mnemonic"]
            and r.json()["cefr"] == "B2"
        )
        if not expect(
            "PUT /cards updates mnemonic + cefr",
            ok,
            f"({r.status_code})",
        ):
            failed += 1

        return failed
    finally:
        if uid:
            delete_user(uid)


if __name__ == "__main__":
    code = main()
    print()
    print("B4:", "ALL PASS" if code == 0 else f"{code} FAILED")
    sys.exit(code)
