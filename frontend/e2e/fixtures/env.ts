const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL missing — playwright.config.ts should load it from frontend/.env.local"
  );
}
if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY missing — playwright.config.ts should load it from backend/.env"
  );
}

export const env = {
  SUPABASE_URL: SUPABASE_URL as string,
  SERVICE_ROLE_KEY: SERVICE_ROLE_KEY as string,
};
