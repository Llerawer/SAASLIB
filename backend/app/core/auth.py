"""JWT auth — strict server-side allowlist for algorithms, audience, and issuer.

Defense-in-depth notes:
  - `algorithms` passed to jwt.decode is a SERVER-DEFINED list, never derived
    from the token header. This blocks algorithm-confusion attacks.
  - Issuer is validated against SUPABASE_URL.
  - Errors are returned as generic "Invalid token" to avoid leaking which
    stage of validation failed.
  - JWKS is cached with a TTL and re-fetched on miss for key rotation.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException
from jose import JWTError, jwt

from app.core.config import settings

ALLOWED_ASYMMETRIC = ("ES256", "RS256")
ALLOWED_SYMMETRIC = ("HS256",)
_JWKS_TTL_SECONDS = 3600
_GENERIC_AUTH_ERROR = "Invalid token"

_jwks_cache: tuple[float, dict] | None = None


def _jwks_url() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _expected_issuer() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"


def _fetch_jwks(force: bool = False) -> dict:
    global _jwks_cache
    now = time.monotonic()
    if not force and _jwks_cache and (now - _jwks_cache[0]) < _JWKS_TTL_SECONDS:
        return _jwks_cache[1]
    r = httpx.get(_jwks_url(), timeout=10.0)
    r.raise_for_status()
    _jwks_cache = (now, r.json())
    return _jwks_cache[1]


def _find_key(kid: str) -> dict | None:
    jwks = _fetch_jwks()
    found = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if found is not None:
        return found
    # Force refresh once — handles legitimate key rotation.
    jwks = _fetch_jwks(force=True)
    return next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)


def _decode_token(token: str) -> dict:
    try:
        unverified_headers = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(401, _GENERIC_AUTH_ERROR) from e

    alg = unverified_headers.get("alg")

    if alg in ALLOWED_SYMMETRIC:
        if not settings.SUPABASE_JWT_SECRET:
            raise HTTPException(401, _GENERIC_AUTH_ERROR)
        key: dict | str = settings.SUPABASE_JWT_SECRET
        allowed = list(ALLOWED_SYMMETRIC)
    elif alg in ALLOWED_ASYMMETRIC:
        kid = unverified_headers.get("kid")
        if not kid:
            raise HTTPException(401, _GENERIC_AUTH_ERROR)
        jwk = _find_key(kid)
        if jwk is None:
            raise HTTPException(401, _GENERIC_AUTH_ERROR)
        key = jwk
        allowed = list(ALLOWED_ASYMMETRIC)
    else:
        raise HTTPException(401, _GENERIC_AUTH_ERROR)

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=allowed,
            audience="authenticated",
            issuer=_expected_issuer(),
        )
    except JWTError as e:
        raise HTTPException(401, _GENERIC_AUTH_ERROR) from e
    return payload


def _extract_token(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, _GENERIC_AUTH_ERROR)
    return authorization.split(" ", 1)[1]


@dataclass
class AuthInfo:
    user_id: str
    jwt: str


async def get_auth(authorization: str = Header(...)) -> AuthInfo:
    """Use this when the endpoint needs to forward the JWT to a user-scoped
    Supabase client (so RLS applies). Otherwise prefer get_current_user_id."""
    token = _extract_token(authorization)
    payload = _decode_token(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(401, _GENERIC_AUTH_ERROR)
    return AuthInfo(user_id=sub, jwt=token)


async def get_current_user_id(authorization: str = Header(...)) -> str:
    auth = await get_auth(authorization)
    return auth.user_id
