"use client";

import { useEffect, useState } from "react";

/**
 * Surfaces a small "Instalar como app" CTA when the browser fires
 * `beforeinstallprompt` (Chrome / Edge / Samsung). Auto-hides if the user
 * dismisses or if the app is already installed. Sober terracota pill that
 * sits at the bottom-left, far from the hero CTA — never competes with it.
 *
 * iOS Safari doesn't fire `beforeinstallprompt`. iOS users get the static
 * "Compartir → Añadir a inicio" hint in the footer instead.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "lr.install.dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hide if already installed (standalone display mode).
    const mq = window.matchMedia?.("(display-mode: standalone)");
    if (mq?.matches) setInstalled(true);

    // Hide if user previously dismissed.
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
    } catch {
      // ignore
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === "dismissed") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      setDismissed(true);
    }
    setDeferred(null);
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  if (installed || dismissed || !deferred) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 hidden md:flex items-center gap-2">
      <button
        type="button"
        onClick={handleInstall}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-[color:var(--stage-bg)] bg-[color:var(--stage-accent)] hover:opacity-90 transition-opacity shadow-[0_6px_20px_-8px_oklch(0_0_0_/_0.4)]"
        style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
          <path d="M12 6v8" />
          <polyline points="9 11 12 14 15 11" />
        </svg>
        Instalar como app
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Descartar"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--stage-bg-elevated)]/80 border border-[color:var(--stage-hairline)] text-[color:var(--stage-ink-muted)] hover:text-[color:var(--stage-ink)]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M1 1 L9 9 M9 1 L1 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
