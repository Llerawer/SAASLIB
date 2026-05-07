"use client";

import { useEffect, useState } from "react";
import { BookOpen, MousePointerClick, GraduationCap, X } from "lucide-react";

import {
  useCapturesList,
  useMyLibrary,
  useReviewQueue,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "lr.onboarding.dismissed.v1";

const STEPS: {
  icon: typeof BookOpen;
  title: string;
  detail: string;
}[] = [
  {
    icon: BookOpen,
    title: "Elige un libro",
    detail: "Más de 78.000 títulos clásicos.",
  },
  {
    icon: MousePointerClick,
    title: "Doble clic en palabras",
    detail: "Captura las que no conozcas.",
  },
  {
    icon: GraduationCap,
    title: "Repasa con SRS",
    detail: "Memorización a largo plazo.",
  },
];

/**
 * Shows a small editorial ribbon explaining the 3-step ritual when the
 * user has nothing in library, nothing pending, and no cards. Dismissible
 * — once closed, never shown again on this device.
 */
export function OnboardingRibbon() {
  const myLibrary = useMyLibrary();
  const captures = useCapturesList({ promoted: false, limit: 1 });
  const reviewQueue = useReviewQueue();
  const [dismissed, setDismissed] = useState(true); // start true to avoid flash

  // localStorage hydration after mount — avoids SSR/CSR mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // private mode / quota — fine, persists in-memory at least
    }
  }

  // Only render when ALL three are loaded AND empty.
  const ready =
    myLibrary.data !== undefined &&
    captures.data !== undefined &&
    reviewQueue.data !== undefined;
  const isNewUser =
    ready &&
    (myLibrary.data?.length ?? 0) === 0 &&
    (captures.data?.length ?? 0) === 0 &&
    (reviewQueue.data?.length ?? 0) === 0;

  if (dismissed || !isNewUser) return null;

  return (
    <section
      className="relative border rounded-xl bg-card overflow-hidden mb-8"
      aria-label="Cómo funciona LinguaReader"
    >
      <div
        className="absolute inset-0 opacity-50 dark:opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 25% 30%, var(--bg-glow-warm) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleDismiss}
        aria-label="Cerrar guía de inicio"
        className="absolute top-2 right-2 z-10"
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Cómo funciona
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <span className="inline-flex items-center justify-center size-9 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span
                    className="absolute -top-1 -right-1 inline-flex items-center justify-center size-4 rounded-full bg-card text-foreground text-[10px] font-bold tabular ring-1 ring-border"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {step.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
