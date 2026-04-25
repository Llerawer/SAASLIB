from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ root regardless of where the process
# was launched from (e.g. uvicorn --app-dir, pytest from monorepo root, etc.).
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    # Optional: only required for legacy HS256 projects.
    # Modern projects (asymmetric ES256/RS256) verify via the public JWKS endpoint.
    SUPABASE_JWT_SECRET: str = ""
    DATABASE_URL: str = ""
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    # External APIs (optional — services degrade gracefully if missing).
    DEEPL_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")


settings = Settings()
