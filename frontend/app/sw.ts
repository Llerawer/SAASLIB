/// <reference lib="WebWorker" />

/**
 * LinguaReader service worker.
 *
 * V1 scope: install the PWA (enables "Add to home screen") + cache static
 * build assets so revisits are fast. Does NOT aggressively cache API
 * responses or EPUBs — that's Phase 2 (offline reading), kept out
 * deliberately to avoid stale-data bugs at this stage.
 *
 * Bundled at request time by @serwist/turbopack and served from
 * /serwist/sw.js via the route handler at app/serwist/[path]/route.ts.
 */
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
