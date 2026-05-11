import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { AppSearchProvider } from "@/components/article/app-search-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <AppSearchProvider>
      <div className="min-h-screen flex flex-col">
        <AppHeader userEmail={user.email ?? ""} />
        <main className="flex-1">{children}</main>
      </div>
    </AppSearchProvider>
  );
}
