"use client";

import { useEffect, useState } from "react";

/**
 * Reactively reports whether the viewport is mobile-sized.
 *
 * Mobile = below the `md` breakpoint (768px). Matches Tailwind's
 * `md:` prefix so JS-driven mobile gates stay in sync with CSS-driven
 * mobile gates throughout the app.
 *
 * SSR-safe: returns `false` on the server (no window) and updates on
 * mount + on resize.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}
