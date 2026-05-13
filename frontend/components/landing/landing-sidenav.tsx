"use client";

import { useEffect, useState } from "react";

/**
 * Floating side-nav (non-linear navigation). Fixed on the right edge, a vertical
 * column of small terracota dots. Each dot links to a section anchor. The active
 * section's dot fills with terracota; inactive dots are hairline rings only.
 * Hidden on mobile.
 */
const ITEMS = [
  { id: "hero", label: "Inicio" },
  { id: "captura", label: "Captura" },
  { id: "pronunciacion", label: "Pronunciación" },
  { id: "memoria", label: "Memoria" },
  { id: "biblioteca", label: "Biblioteca" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "precios", label: "Precios" },
] as const;

export function LandingSidenav() {
  const [active, setActive] = useState<string>("hero");

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observers: IntersectionObserver[] = [];
    for (const item of ITEMS) {
      const node = document.getElementById(item.id);
      if (!node) continue;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) setActive(item.id);
          }
        },
        { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
      );
      io.observe(node);
      observers.push(io);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <nav
      aria-label="Navegación de secciones"
      className="hidden md:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 flex-col gap-4"
    >
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-label={item.label}
            aria-current={isActive ? "true" : undefined}
            className="group relative flex items-center justify-end"
          >
            <span
              className="pointer-events-none absolute right-5 whitespace-nowrap text-[0.78rem] italic opacity-0 -translate-x-1 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-hover:translate-x-0 text-[color:var(--stage-ink-muted)]"
              style={{ fontFamily: "var(--font-bricolage), sans-serif" }}
            >
              {item.label}
            </span>
            <span
              className="block h-2 w-2 rounded-full transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                backgroundColor: isActive ? "var(--stage-accent)" : "transparent",
                border: isActive
                  ? "1px solid var(--stage-accent)"
                  : "1px solid color-mix(in oklch, var(--stage-accent) 55%, transparent)",
              }}
            />
          </a>
        );
      })}
    </nav>
  );
}
