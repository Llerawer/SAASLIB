"use client";

import { useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full px-4 py-3 rounded-md bg-[color:var(--landing-bg)] border border-[color:var(--landing-hairline)] text-[color:var(--landing-ink)] placeholder:text-[color:var(--landing-ink-faint)] focus:outline-none focus:border-[color:var(--landing-accent)] focus:ring-2 focus:ring-[color:var(--landing-accent)]/30 transition-colors";

const labelStyle = { fontFamily: "var(--font-bricolage), sans-serif" } as const;

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <h1 className="prose-serif text-[2rem] leading-[1.1] text-[color:var(--landing-ink)]">
            Revisa tu email.
          </h1>
          <p className="prose-serif italic text-[0.95rem] text-[color:var(--landing-ink-muted)]">
            Te enviamos un enlace a {email}.
          </p>
        </header>
        <Link
          href="/login"
          className="text-sm text-[color:var(--landing-accent)] underline-offset-4 hover:underline"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <h1 className="prose-serif text-[2rem] leading-[1.1] text-[color:var(--landing-ink)]">
          Recupera tu acceso.
        </h1>
        <p className="prose-serif italic text-[0.95rem] text-[color:var(--landing-ink-muted)]">
          Te enviaremos un enlace por email.
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
        {loading ? "Enviando" : "Enviar enlace"}
      </button>

      <Link
        href="/login"
        className="text-sm text-[color:var(--landing-ink-muted)] hover:text-[color:var(--landing-ink)] underline-offset-4 hover:underline block text-center"
      >
        Volver
      </Link>
    </form>
  );
}
