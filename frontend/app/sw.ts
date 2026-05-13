/// <reference lib="WebWorker" />

/**
 * LinguaReader service worker.
 *
 * V1 scope: install the PWA (enables "Add to home screen") + cache static
 * build assets so revisits are fast. Does NOT aggressively cache API
 * responses or EPUBs — that's Phase 2 (offline reading), kept out
 * deliberately to avoid stale-data bugs at this stage.
 *
 * Custom runtime cache: card-media images served via Supabase Storage
 * signed URLs use a stale-while-revalidate strategy. They're heavy to
 * re-fetch and barely ever change (user uploaded once), so we want
 * instant render on repeat reviews. The signed-URL query string token
 * varies per fetch, so the cache key strips ?token=... — see the
 * matcher below.
 *
 * Bundled at request time by @serwist/turbopack and served from
 * /serwist/sw.js via the route handler at app/serwist/[path]/route.ts.
 */
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import { Serwist, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Matches Supabase Storage signed URLs for the cards-media bucket.
 *  Signed URLs change their `?token=...` per fetch, so we'd thrash the
 *  cache if we keyed by full URL. Stripping the query string makes the
 *  cache key stable for a given object path. */
const cardMediaCache: RuntimeCaching = {
  matcher: ({ url }) =>
    url.pathname.includes("/storage/v1/object/sign/cards-media/") ||
    url.pathname.includes("/storage/v1/object/public/cards-media/"),
  handler: new StaleWhileRevalidate({
    cacheName: "card-media-v1",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [cardMediaCache, ...defaultCache],
});

serwist.addEventListeners();
