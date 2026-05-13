"use client";

import { useEffect } from "react";
import { useStats } from "@/lib/api/queries";

/**
 * One-shot client component that handles two PWA-side concerns:
 *
 *  1. Registers the service worker (served by app/serwist/[path]/route.ts).
 *     Done once on mount; idempotent.
 *
 *  2. Mirrors the SRS due-card count as a badge on the installed PWA icon.
 *     - Android / Desktop Chrome: numeric badge over the home-screen icon.
 *     - iOS Safari: silently no-ops (API not exposed to PWAs yet).
 *     - Browsers without the API: silently no-ops.
 *
 * Mount once near the root inside the React Query provider.
 */
export function AppBadgeSync() {
  const { data: stats } = useStats();
  const dueToday = stats?.cards_today_due ?? 0;

  // Register the service worker once on mount.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // skip in dev

    navigator.serviceWorker
      .register("/serwist/sw.js", { type: "module", scope: "/" })
      .catch((err) => {
        // Don't crash the app on SW registration issues; log for visibility.
        console.warn("[pwa] sw registration failed:", err);
      });
  }, []);

  // Sync the app badge with the due-card count.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("setAppBadge" in navigator) || !("clearAppBadge" in navigator)) {
      return; // iOS Safari / unsupported — silently skip.
    }

    if (dueToday > 0) {
      navigator.setAppBadge(dueToday).catch(() => {
        // Permission not granted or transient failure — fine to ignore.
      });
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [dueToday]);

  return null;
}
