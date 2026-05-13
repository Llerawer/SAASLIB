import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LandingShell } from "@/components/landing/landing-shell";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/library");
  return <LandingShell />;
}
