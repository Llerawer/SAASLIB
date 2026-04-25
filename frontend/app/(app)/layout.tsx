import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/logout-button";

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
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link href="/library" className="font-bold">
            LinguaReader
          </Link>
          <Link href="/library" className="text-muted-foreground hover:text-foreground">
            Biblioteca
          </Link>
          <Link href="/vocabulary" className="text-muted-foreground hover:text-foreground">
            Vocabulario
          </Link>
          <Link href="/srs" className="text-muted-foreground hover:text-foreground">
            Repaso
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
