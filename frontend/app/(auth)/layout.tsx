import { BookOpen } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      <div
        className="absolute inset-0 opacity-60 dark:opacity-25 pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, var(--bg-glow-warm) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <header className="px-4 sm:px-6 py-4 flex items-center">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
        >
          <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
          <span>LinguaReader</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <p className="text-center text-sm text-muted-foreground mb-6 font-serif italic">
            Lee en inglés, captura palabras, repasa con SRS.
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
