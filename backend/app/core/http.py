"""Shared httpx.AsyncClient — one pool for the whole app.

Why: creating a new AsyncClient per request costs a fresh DNS+TCP+TLS
handshake (~200-400ms to gutenberg.org / api.deepl.com). With one pooled
client, those connections stay keep-alive between calls.

Lifecycle: lazily created on first use under an asyncio.Lock to prevent
concurrent init races, closed in FastAPI's lifespan shutdown so connections
don't linger in TIME_WAIT.
"""
from __future__ import annotations

import asyncio

import httpx

_client: httpx.AsyncClient | None = None
_init_lock = asyncio.Lock()


def _build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(60.0, connect=10.0),
        limits=httpx.Limits(
            max_keepalive_connections=20,
            max_connections=50,
            keepalive_expiry=60.0,
        ),
        follow_redirects=True,
        headers={"User-Agent": "LinguaReader/0.1 (+https://linguareader.local)"},
    )


async def aget_client() -> httpx.AsyncClient:
    """Async-safe client accessor. Use this in async contexts."""
    global _client
    if _client is not None and not _client.is_closed:
        return _client
    async with _init_lock:
        if _client is None or _client.is_closed:
            _client = _build_client()
        return _client


def get_client() -> httpx.AsyncClient:
    """Sync entry point (no lock — relies on the fact that the first request
    after startup creates it, and subsequent calls just read the global).
    Prefer aget_client() in cold paths where init may race."""
    global _client
    if _client is None or _client.is_closed:
        _client = _build_client()
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
