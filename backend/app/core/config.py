from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ root regardless of where the process
# was launched from (e.g. uvicorn --app-dir, pytest from monorepo root, etc.).
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    # Anon key — used by user-scoped client so RLS applies (auth.uid() = JWT sub).
    SUPABASE_ANON_KEY: str = ""
    # Optional: only required for legacy HS256 projects.
    # Modern projects (asymmetric ES256/RS256) verify via the public JWKS endpoint.
    SUPABASE_JWT_SECRET: str = ""
    DATABASE_URL: str = ""
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    # External APIs (optional — services degrade gracefully if missing).
    DEEPL_API_KEY: str = ""

    # ===== Cache / distributed lock backend selection =====
    # auto   = use Redis if REDIS_URL is reachable, else in-memory.
    #          Convenient for dev. NOT recommended for prod (silent fallback
    #          masks Redis outages).
    # redis  = REQUIRE Redis. App fails to boot if REDIS_URL is missing or
    #          unreachable. Production-safe.
    # memory = NEVER use Redis even if REDIS_URL is set. Useful for single-
    #          process deployments where you want fully predictable behavior.
    CACHE_MODE: Literal["auto", "redis", "memory"] = "auto"
    REDIS_URL: str = ""

    # ===== Background-warmer ownership =====
    # In multi-pod deploys we don't want every pod hammering Gutendex with
    # its own warmup cycle (N pods × 50 calls × every 6 h). Set this true on
    # exactly ONE pod (the "leader") and false on the rest. Default true so
    # single-pod deployments need zero config.
    WARMER_ENABLED: bool = True

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")


settings = Settings()
