"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="w-full text-center space-y-4 border rounded-xl p-6 bg-card shadow-sm">
        <Mail
          className="h-10 w-10 mx-auto text-accent"
          aria-hidden="true"
        />
        <h1 className="text-2xl font-bold tracking-tight">Revisa tu email</h1>
        <p className="text-sm text-muted-foreground">
          Te enviamos un enlace para resetear tu contraseña a {email}.
        </p>
        <Link
          href="/login"
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-5 border rounded-xl p-6 bg-card shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Resetear contraseña
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Te enviaremos un enlace por email.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          autoComplete="email"
        />
      </div>
      {error && (
        <div
          className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-2.5 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enviando" : "Enviar enlace"}
      </Button>
      <Link
        href="/login"
        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline block text-center"
      >
        Volver
      </Link>
    </form>
  );
}
