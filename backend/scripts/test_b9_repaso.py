"""B9 E2E: Repaso v2 — suspend, unsuspend, flag, edit, reset, source, tomorrow_due stat."""
from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

import os as _os
_os.chdir(r"C:\Users\GERARDO\saas-repaso-v2\backend")

from app.core.config import settings  # noqa: E402

API = os.environ.get("API_URL", "http://localhost:8092")
ADMIN = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


def cu(email: str, pw: str) -> str:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
        headers=ADMIN,
        json={"email": email, "password": pw, "email_confirm": True},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["id"]


def du(uid: str) -> None:
    httpx.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}",
        headers=ADMIN,
        timeout=20,
    )


def si(email: str, pw: str) -> str:
    r = httpx.post(
        f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": pw},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def ok(label: str, cond: bool, info: str = "") -> bool:
    print(f"  {'PASS' if cond else 'FAIL'}: {label} {info}")
    return cond


def main() -> int:
    suffix = uuid.uuid4().hex[:8]
    email = f"b9-{suffix}@example.com"
    pw = uuid.uuid4().hex
    uid = None
    failed = 0
    try:
        uid = cu(email, pw)
        time.sleep(0.5)
        token = si(email, pw)
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 1) Capture + promote a card
        cap = httpx.post(
            f"{API}/api/v1/captures",
            headers=h,
            json={"word": "elusive", "language": "en"},
            timeout=30,
        ).json()
        prom = httpx.post(
            f"{API}/api/v1/cards/promote-from-captures",
            headers=h,
            json={"capture_ids": [cap["id"]]},
            timeout=30,
        ).json()
        card_id = prom["cards"][0]["id"]
        failed += not ok("promote -> 1 card", len(prom["cards"]) == 1)

        # 2) Suspend → queue should not contain card
        rs = httpx.post(f"{API}/api/v1/cards/{card_id}/suspend", headers=h, timeout=20)
        failed += not ok("suspend 200", rs.status_code == 200)
        q = httpx.get(f"{API}/api/v1/reviews/queue?limit=10", headers=h, timeout=20).json()
        failed += not ok(
            "suspended card excluded from queue",
            all(c["card_id"] != card_id for c in q),
        )

        # 3) Unsuspend → queue should contain card again
        ru = httpx.post(f"{API}/api/v1/cards/{card_id}/unsuspend", headers=h, timeout=20)
        failed += not ok("unsuspend 200", ru.status_code == 200)
        q = httpx.get(f"{API}/api/v1/reviews/queue?limit=10", headers=h, timeout=20).json()
        failed += not ok(
            "unsuspended card re-appears in queue",
            any(c["card_id"] == card_id for c in q),
        )

        # 4) Flag = 2
        rf = httpx.post(
            f"{API}/api/v1/cards/{card_id}/flag",
            headers=h,
            json={"flag": 2},
            timeout=20,
        )
        failed += not ok("flag 200", rf.status_code == 200)
        cards = httpx.get(f"{API}/api/v1/cards", headers=h, timeout=20).json()
        c = next((x for x in cards if x["id"] == card_id), None)
        failed += not ok("flag persisted in CardOut", c is not None and c.get("flag") == 2)

        # 5) Edit mnemonic via PUT
        re = httpx.put(
            f"{API}/api/v1/cards/{card_id}",
            headers=h,
            json={"mnemonic": "test-mnemonic-from-b9"},
            timeout=20,
        )
        failed += not ok("edit 200", re.status_code == 200)
        failed += not ok(
            "mnemonic updated",
            re.json().get("mnemonic") == "test-mnemonic-from-b9",
        )

        # 6) Reset FSRS
        rr = httpx.post(f"{API}/api/v1/cards/{card_id}/reset", headers=h, timeout=20)
        failed += not ok("reset 200", rr.status_code == 200)
        # Verifica que la card aparece en queue de nuevo (state vuelve a 0/1, due_at <= now)
        q = httpx.get(f"{API}/api/v1/reviews/queue?limit=10", headers=h, timeout=20).json()
        card_in_q = next((x for x in q if x["card_id"] == card_id), None)
        failed += not ok(
            "after reset card has fsrs_state in {0,1}",
            card_in_q is not None and card_in_q.get("fsrs_state") in (0, 1),
        )

        # 7) GET /cards/:id/source
        sr = httpx.get(f"{API}/api/v1/cards/{card_id}/source", headers=h, timeout=20)
        failed += not ok("source 200", sr.status_code == 200)
        sj = sr.json()
        failed += not ok(
            "source returns origin capture",
            sj is not None and sj.get("capture_id") == cap["id"],
        )

        # 8) Stats has cards_tomorrow_due
        st = httpx.get(f"{API}/api/v1/stats/me", headers=h, timeout=20).json()
        failed += not ok(
            "stats has cards_tomorrow_due (int)",
            "cards_tomorrow_due" in st and isinstance(st["cards_tomorrow_due"], int),
        )

        # 9) Media upload-url + confirm + delete (full roundtrip)
        # The signed-url creation hits storage.objects RLS, which requires
        # the user JWT to be forwarded to the storage sub-client. This was
        # broken in supabase-py defaults until get_user_client was patched.
        png_bytes = (
            b"\x89PNG\r\n\x1a\n"
            b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
            b"\x00\x00\x00\rIDATx\x9cc\xfc\xff\xff?\x03\x05\x00\x01\x05\x00\xfe\xa7T\xff\xc8"
            b"\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        url_resp = httpx.post(
            f"{API}/api/v1/cards/{card_id}/media/upload-url",
            headers=h,
            json={"type": "image", "mime": "image/png", "size": len(png_bytes)},
            timeout=20,
        )
        failed += not ok(
            "media/upload-url 200 (storage RLS happy)",
            url_resp.status_code == 200,
            f"got {url_resp.status_code}: {url_resp.text[:200]}",
        )
        if url_resp.status_code == 200:
            payload = url_resp.json()
            put = httpx.put(
                payload["upload_url"],
                content=png_bytes,
                headers={"Content-Type": "image/png"},
                timeout=30,
            )
            failed += not ok("storage PUT 200", put.status_code in (200, 201))

            confirm = httpx.post(
                f"{API}/api/v1/cards/{card_id}/media/confirm",
                headers=h,
                json={"type": "image", "path": payload["path"]},
                timeout=20,
            )
            failed += not ok(
                "media/confirm 200",
                confirm.status_code == 200,
                f"got {confirm.status_code}: {confirm.text[:200]}",
            )
            if confirm.status_code == 200:
                failed += not ok(
                    "user_image_url persisted on card",
                    confirm.json().get("user_image_url") == payload["path"],
                )

            delete = httpx.delete(
                f"{API}/api/v1/cards/{card_id}/media/image",
                headers=h,
                timeout=20,
            )
            failed += not ok(
                "media/delete 200 + nullified",
                delete.status_code == 200 and delete.json().get("user_image_url") is None,
            )

    finally:
        if uid:
            du(uid)
    print(f"\n{'ALL PASS' if failed == 0 else f'{failed} FAILED'}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
