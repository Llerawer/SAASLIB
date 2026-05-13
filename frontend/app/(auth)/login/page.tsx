"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full px-4 py-3 rounded-md bg-[color:var(--landing-bg)] border border-[color:var(--landing-hairline)] text-[color:var(--landing-ink)] placeholder:text-[color:var(--landing-ink-faint)] focus:outline-none focus:border-[color:var(--landing-accent)] focus:ring-2 focus:ring-[color:var(--landing-accent)]/30 transition-colors";

const labelStyle = { fontFamily: "var(--font-bricolage), sans-serif" } as const;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/library");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <h1 className="prose-serif text-[2rem] leading-[1.1] text-[color:var(--landing-ink)]">
          Bienvenido de vuelta.
        </h1>
        <p className="prose-serif italic text-[0.95rem] text-[color:var(--landing-ink-muted)]">
          Entra para continuar leyendo.
        </p>
      </header>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-[0.78rem] uppercase tracking-wide text-[color:var(--landing-ink-muted)]"
          style={labelStyle}
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          autoComplete="email"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[0.78rem] uppercase tracking-wide text-[color:var(--landing-ink-muted)]"
          style={labelStyle}
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="text-sm text-[color:var(--landing-accent)] bg-[color:var(--landing-accent-soft)] border border-[color:var(--landing-accent)]/30 rounded-md px-3 py-2"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center rounded-md px-5 py-3 text-base font-medium text-[color:var(--landing-bg)] bg-[color:var(--landing-accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
        style={labelStyle}
      >
        {loading ? "Entrando" : "Entrar"}
      </button>

      <div className="flex justify-between text-sm">
        <Link
          href="/reset"
          className="text-[color:var(--landing-ink-muted)] hover:text-[color:var(--landing-ink)] underline-offset-4 hover:underline"
        >
          Olvidé mi contraseña
        </Link>
        <Link
          href="/signup"
          className="text-[color:var(--landing-accent)] underline-offset-4 hover:underline"
        >
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}
