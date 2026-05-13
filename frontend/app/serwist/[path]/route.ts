/**
 * Serves the service worker bundle and its chunks at /serwist/<file>.
 *
 * Required by @serwist/turbopack because Turbopack doesn't yet support
 * webpack plugins, so the SW is bundled on demand via esbuild from a
 * Next.js route handler instead of being emitted as a static file.
 *
 * Browser registers `/serwist/sw.js`; the route handler returns it (and
 * its sourcemap + any code-split chunks) with proper headers.
 *
 * Route segment config values are inlined as literals (not destructured
 * from the returned object) because Next.js statically parses them at
 * compile time.
 */
import { createSerwistRoute } from "@serwist/turbopack";
import path from "node:path";

const route = createSerwistRoute({
  swSrc: path.join(process.cwd(), "app", "sw.ts"),
  globDirectory: process.cwd(),
  useNativeEsbuild: false,
});

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;
export const generateStaticParams = route.generateStaticParams;
export const GET = route.GET;
