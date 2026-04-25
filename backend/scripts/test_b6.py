"""B6 E2E: capture → promote → grade → undo → queue."""
from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

import os as _os
_os.chdir(r"C:\Users\GERARDO\saas\backend")

from app.core.config import settings  # noqa: E402

API = os.environ.get("API_URL", "http://localhost:8092")
ADMIN = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def cu(email, pw):
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN,
        json={"email": email, "password": pw, "email_confirm": True},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["id"]


def du(uid):
    httpx.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}", headers=ADMIN, timeout=20
    )


def si(email, pw):
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": settings.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": pw},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def ok(label, cond, info=""):
    print(f"  {'PASS' if cond else 'FAIL'}: {label} {info}")
    return cond


def main():
    suffix = uuid.uuid4().hex[:8]
    email = f"b6-{suffix}@example.com"
    pw = uuid.uuid4().hex
    uid = None
    failed = 0
    try:
        uid = cu(email, pw)
        time.sleep(0.5)
        token = si(email, pw)
        auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 1) Capture + promote a card
        cap = httpx.post(
            f"{API}/api/v1/captures",
            headers=auth,
            json={"word": "gleaming", "language": "en"},
            timeout=30,
        ).json()
        prom = httpx.post(
            f"{API}/api/v1/cards/promote-from-captures",
            headers=auth,
            json={"capture_ids": [cap["id"]]},
            timeout=30,
        ).json()
        card_id = prom["cards"][0]["id"]

        # 2) Queue should include it (state=new/learning, due now)
        r = httpx.get(f"{API}/api/v1/reviews/queue", headers=auth, timeout=15)
        if not ok(
            "GET queue returns the new card",
            r.status_code == 200 and any(c["card_id"] == card_id for c in r.json()),
            f"({r.status_code} {len(r.json()) if r.status_code == 200 else '-'} cards)",
        ):
            failed += 1
            return failed

        # 3) Grade Good (3)
        r = httpx.post(
            f"{API}/api/v1/reviews/{card_id}/grade",
            headers=auth,
            json={"grade": 3},
            timeout=15,
        )
        if not ok(
            "POST grade=3 succeeds",
            r.status_code == 200 and r.json().get("review_id"),
            f"({r.status_code} body={r.text[:200]})",
        ):
            failed += 1
            return failed
        graded = r.json()
        if not ok(
            "before/after states present",
            graded["state_before"] is not None and graded["state_after"] is not None,
        ):
            failed += 1

        # 4) Undo
        r = httpx.post(f"{API}/api/v1/reviews/undo", headers=auth, timeout=15)
        if not ok(
            "POST undo restores",
            r.status_code == 200 and r.json()["restored_card_id"] == card_id,
            f"({r.status_code})",
        ):
            failed += 1

        # 5) Undo again → 404 (no more reviews)
        r = httpx.post(f"{API}/api/v1/reviews/undo", headers=auth, timeout=15)
        if not ok("Second undo -> 404", r.status_code == 404, f"({r.status_code})"):
            failed += 1

        # 6) After undo, queue still has the card
        r = httpx.get(f"{API}/api/v1/reviews/queue", headers=auth, timeout=15)
        if not ok(
            "Card back in queue after undo",
            r.status_code == 200 and any(c["card_id"] == card_id for c in r.json()),
        ):
            failed += 1

        # 7) Re-grade Easy → state moves forward
        r = httpx.post(
            f"{API}/api/v1/reviews/{card_id}/grade",
            headers=auth,
            json={"grade": 4},
            timeout=15,
        )
        if not ok(
            "Re-grade Easy succeeds",
            r.status_code == 200,
            f"({r.status_code})",
        ):
            failed += 1

        # 8) Invalid grade rejected
        r = httpx.post(
            f"{API}/api/v1/reviews/{card_id}/grade",
            headers=auth,
            json={"grade": 7},
            timeout=15,
        )
        if not ok("Invalid grade -> 422", r.status_code == 422, f"({r.status_code})"):
            failed += 1

        return failed
    finally:
        if uid:
            du(uid)


if __name__ == "__main__":
    code = main()
    print()
    print("B6 E2E:", "ALL PASS" if code == 0 else f"{code} FAILED")
    sys.exit(code)
