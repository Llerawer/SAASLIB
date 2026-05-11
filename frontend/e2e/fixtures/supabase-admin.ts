import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

const admin = createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function createTestUser(
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !error.message.includes("not found")) throw error;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return data?.users.find((u) => u.email === email)?.id ?? null;
}

export function makeTestCreds(): { email: string; password: string } {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    email: `e2e-${suffix}@example.test`,
    password: `e2e-Test-${suffix}!`,
  };
}
