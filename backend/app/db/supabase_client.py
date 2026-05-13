from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """Service-role Supabase client. **Bypasses RLS.**

    Use ONLY for:
      - global / public tables (word_cache, books catalog, gutenberg_reading_info)
      - admin-only operations (audit_logs writes, user provisioning)
      - data NOT scoped to a single user

    For any query touching user-owned data (captures, cards, reviews, etc.)
    use `get_user_client(jwt)` so RLS applies as defense-in-depth.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(jwt: str) -> Client:
    """User-scoped Supabase client. **RLS applies** — `auth.uid()` resolves
    to the JWT's `sub` claim, so policies like `user_id = auth.uid()` filter
    rows automatically.

    Use this in every endpoint that reads or writes user-owned data. The
    backend's manual `.eq("user_id", user_id)` filters become defense-in-depth
    instead of the only line of defense.

    NOTE: supabase-py does NOT propagate the user JWT to the storage sub-client.
    `client.postgrest.auth(jwt)` only patches PostgREST. Storage operations
    would otherwise go out with the anon key, making `auth.uid()` resolve to
    NULL inside `storage.objects` RLS policies (e.g. our `cards-media: own
    files insert` policy that checks
    `(storage.foldername(name))[1] = auth.uid()::text`). We override the
    Authorization header on the storage client's underlying httpx session so
    the JWT travels with storage operations too.
    """
    if not settings.SUPABASE_ANON_KEY:
        raise RuntimeError(
            "SUPABASE_ANON_KEY not configured — required for user-scoped "
            "queries with RLS. Add it to backend/.env."
        )
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(jwt)
    # Forward the JWT to storage too. `_client` is private but stable across
    # supabase-py 2.x (tracked in supabase-community/supabase-py#724).
    client.storage._client.headers["authorization"] = f"Bearer {jwt}"
    return client
