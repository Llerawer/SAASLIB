from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

import asyncio

from app.api.v1 import (
    books,
    bookmarks,
    captures,
    cards,
    dictionary,
    internal,
    reviews,
    stats,
    translate,
    videos,
)
from app.core.alerts import install_default_alerts, run_periodic
from app.core.auth import get_current_user_id
from app.core.config import settings
from app.core.db import close_pool
from app.core.http import close_client
from app.core.rate_limit import limiter
from app.core.redis_client import close_redis, ensure_redis_ready
from app.services.gutenberg import warmup_popular


_background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Validate Redis BEFORE accepting traffic (CACHE_MODE=redis fails here
    # instead of silently degrading later).
    await ensure_redis_ready()

    # Install default alert rules + start the evaluator loop.
    install_default_alerts()
    alert_task = asyncio.create_task(run_periodic(30.0), name="alert-evaluator")
    _background_tasks.add(alert_task)
    alert_task.add_done_callback(_background_tasks.discard)

    # Warm cache for popular categories so the first user click is instant.
    # KEEP the reference — asyncio holds only weak refs; otherwise the task
    # can be garbage-collected mid-execution.
    warmup_task = asyncio.create_task(warmup_popular(), name="gutenberg-warmup")
    _background_tasks.add(warmup_task)
    warmup_task.add_done_callback(_background_tasks.discard)

    yield

    # Cancel background loops, then close pools.
    for t in list(_background_tasks):
        if not t.done():
            t.cancel()
    await close_client()
    await close_pool()
    await close_redis()


app = FastAPI(title="LinguaReader API", version="0.1.0", lifespan=lifespan)

# Rate limiting (slowapi).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — explicit method/header allowlist instead of "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Cache", "X-Cache-Age"],
    max_age=600,
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defense-in-depth headers. CSP belongs on the frontend (Next.js
    config); these protect API responses against MIME sniffing, clickjacking
    and over-shared referrers."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def prometheus_metrics():
    """Prometheus scrape endpoint (text/plain). Public — Prometheus servers
    don't send auth headers. Don't expose secrets in metric labels.
    Production: restrict by network policy / private port."""
    from starlette.responses import Response

    from app.core.metrics import render_prometheus

    body, content_type = render_prometheus()
    return Response(content=body, media_type=content_type)


@app.get("/api/v1/me")
async def me(user_id: str = Depends(get_current_user_id)):
    return {"user_id": user_id}


app.include_router(books.router)
app.include_router(bookmarks.router)
app.include_router(captures.router)
app.include_router(cards.router)
app.include_router(dictionary.router)
app.include_router(reviews.router)
app.include_router(stats.router)
app.include_router(translate.router)
app.include_router(videos.router)
app.include_router(internal.router)
