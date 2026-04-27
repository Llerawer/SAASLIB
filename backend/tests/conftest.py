"""Shared pytest fixtures + env setup for the test suite.

Loaded once per test session by pytest. Sets defaults for required env vars
so tests that import `app.core.config` don't crash on eager Settings()
validation when no .env file is present (CI, fresh dev env).

Real values must be in a .env file for integration tests against Supabase;
these defaults are only enough to let imports succeed for unit tests with
mocked clients.
"""
import os

# Idempotent: existing env wins, so .env / shell env override these.
os.environ.setdefault("SUPABASE_URL", "https://stub.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub-key")
