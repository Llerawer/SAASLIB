/** Build-time config. Hardcoded for v1 — load-unpacked dev only.
 *  When we ship for real, switch to import.meta.env vars and ship a
 *  prod build with the production URLs baked in. */

export const SUPABASE_URL = "https://xatqtdafndsmryfbskpk.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdHF0ZGFmbmRzbXJ5ZmJza3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNzI1MDMsImV4cCI6MjA5MjY0ODUwM30." +
  "gCU5c8yo7XAVXSgXZMhyPQ78qo0QHfY-LmG4fUCeCVo";

/** Backend API base. Localhost for dev; switch to prod URL when shipping. */
export const API_BASE = "http://localhost:8100";

/** Frontend SaaS base. Used to open the deck player in a floating window. */
export const FRONTEND_BASE = "http://localhost:3000";
