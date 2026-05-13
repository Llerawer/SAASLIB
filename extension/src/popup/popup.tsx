import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { AuthStateResponse } from "../shared/messages";

type View =
  | { kind: "loading" }
  | { kind: "login"; error: string | null; submitting: boolean }
  | { kind: "connected"; email: string; capturesToday: number };

function App() {
  const [view, setView] = useState<View>({ kind: "loading" });

  // Probe initial auth state on mount.
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "auth-state" }, (resp: AuthStateResponse) => {
      if (resp?.signedIn && resp.email) {
        setView({
          kind: "connected",
          email: resp.email,
          capturesToday: resp.capturesToday ?? 0,
        });
      } else {
        setView({ kind: "login", error: null, submitting: false });
      }
    });
  }, []);

  function handleLogin(email: string, password: string) {
    setView({ kind: "login", error: null, submitting: true });
    chrome.runtime.sendMessage(
      { type: "sign-in", email, password },
      (resp: { ok: boolean; error?: string }) => {
        if (resp?.ok) {
          // After sign-in, fetch the counter (fresh state in SW)
          chrome.runtime.sendMessage(
            { type: "auth-state" },
            (auth: AuthStateResponse) => {
              setView({
                kind: "connected",
                email,
                capturesToday: auth?.capturesToday ?? 0,
              });
            },
          );
        } else {
          setView({
            kind: "login",
            error: resp?.error ?? "No se pudo iniciar sesión",
            submitting: false,
          });
        }
      },
    );
  }

  function handleLogout() {
    chrome.runtime.sendMessage({ type: "sign-out" }, () => {
      setView({ kind: "login", error: null, submitting: false });
    });
  }

  if (view.kind === "loading") {
    return <p className="subtitle">Cargando…</p>;
  }

  if (view.kind === "connected") {
    return (
      <>
        <h1>LinguaReader</h1>
        <div className="connected">
          <span className="dot" aria-hidden />
          <span className="email">{view.email}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Hoy</span>
          <span className="stat-value">{view.capturesToday}</span>
          <span className="stat-suffix">
            {view.capturesToday === 1 ? "captura" : "capturas"}
          </span>
        </div>
        <p className="subtitle">
          Doble-click en cualquier palabra para guardar.
        </p>
        <button className="btn btn-ghost" onClick={handleLogout}>
          Cerrar sesión
        </button>
        <p className="tip">
          La extensión funciona en cualquier página web. Tus capturas
          aparecen en tu cuenta de LinguaReader normalmente.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>LinguaReader</h1>
      <p className="subtitle">
        Iniciá sesión con la misma cuenta que usás en la app.
      </p>
      <LoginForm
        onSubmit={handleLogin}
        error={view.error}
        submitting={view.submitting}
      />
    </>
  );
}

function LoginForm({
  onSubmit,
  error,
  submitting,
}: {
  onSubmit: (email: string, password: string) => void;
  error: string | null;
  submitting: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!email || !password || submitting) return;
        onSubmit(email, password);
      }}
    >
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={submitting}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={submitting}
        />
      </div>
      <button className="btn" type="submit" disabled={submitting}>
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
