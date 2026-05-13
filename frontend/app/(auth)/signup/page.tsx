"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full px-4 py-3 rounded-md bg-[color:var(--landing-bg)] border border-[color:var(--landing-hairline)] text-[color:var(--landing-ink)] placeholder:text-[color:var(--landing-ink-faint)] focus:outline-none focus:border-[color:var(--landing-accent)] focus:ring-2 focus:ring-[color:var(--landing-accent)]/30 transition-colors";

const labelStyle = { fontFamily: "var(--font-bricolage), sans-serif" } as const;

export default function SignupPage() {
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
    const { error } = await supabase.auth.signUp({ email, password });
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
          Empieza tu biblioteca.
        </h1>
        <p className="prose-serif italic text-[0.95rem] text-[color:var(--landing-ink-muted)]">
          Una cuenta gratis. Sin tarjeta para empezar.
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 8 caracteres"
          autoComplete="new-password"
          aria-describedby="password-hint"
          className={inputClass}
        />
        <p
          id="password-hint"
          className="text-[0.78rem] italic text-[color:var(--landing-ink-faint)]"
        >
          Al menos 8 caracteres.
        </p>
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
        {loading ? "Creando" : "Crear cuenta"}
      </button>

      <p className="text-sm text-center text-[color:var(--landing-ink-muted)]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="text-[color:var(--landing-accent)] underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </form>
  );
}
