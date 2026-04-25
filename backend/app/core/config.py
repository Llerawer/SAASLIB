from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    # Optional: only required for legacy HS256 projects.
    # Modern projects (asymmetric ES256/RS256) verify via the public JWKS endpoint.
    SUPABASE_JWT_SECRET: str = ""
    DATABASE_URL: str = ""
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
