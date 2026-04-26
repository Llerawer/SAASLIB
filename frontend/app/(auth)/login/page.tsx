"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-5 border rounded-xl p-6 bg-card shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bienvenido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entra para continuar leyendo.
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
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
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
        {loading ? "Entrando" : "Entrar"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link
          href="/reset"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Olvidé mi contraseña
        </Link>
        <Link
          href="/signup"
          className="text-accent underline-offset-4 hover:underline"
        >
          Crear cuenta
        </Link>
      </div>
    </form>
  );
}
