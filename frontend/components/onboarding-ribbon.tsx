"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import {
  useCapturesList,
  useMyLibrary,
  useReviewQueue,
} from "@/lib/api/queries";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "lr.onboarding.dismissed.v1";

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Elige un libro",
    detail: "Más de 78.000 títulos clásicos.",
  },
  {
    title: "Doble clic en palabras",
    detail: "Captura las que no conozcas.",
  },
  {
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
      className="relative border border-border rounded-xl bg-card mb-8"
      aria-label="Cómo funciona LinguaReader"
    >
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleDismiss}
        aria-label="Cerrar guía de inicio"
        className="absolute top-2 right-2 z-10"
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="size-1 rounded-full bg-accent" aria-hidden />
          Cómo funciona
        </p>
        <div className="mt-2 mb-5 flex items-center gap-2 max-w-xs">
          <div className="h-px w-8 bg-accent/70" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span
                className="font-serif text-2xl font-semibold tabular text-accent leading-none shrink-0"
                aria-hidden="true"
              >
                {i + 1}.
              </span>
              <div className="min-w-0">
                <p className="font-serif text-base font-semibold leading-tight">
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {step.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
