import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow phone/LAN devices + Cloudflare quick tunnels to hit the dev
  // server during testing. The tunnel hostname changes every time you
  // start cloudflared — the wildcard catches all `*.trycloudflare.com`
  // so you don't have to edit this file on each new tunnel.
  allowedDevOrigins: ["192.168.1.68", "*.trycloudflare.com"],
  // Proxy /api/* through Next.js to the backend. Solves three problems
  // at once when running through a Cloudflare tunnel or in production:
  //   - Phone sees a single origin (no mixed-content blocks).
  //   - No CORS — request is same-origin from the browser's POV.
  //   - No second tunnel needed for the backend.
  // Set BACKEND_PROXY_URL in env for production; localhost:8100 is the
  // dev/local backend default.
  async rewrites() {
    const target = process.env.BACKEND_PROXY_URL ?? "http://localhost:8100";
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
  // Acknowledge Turbopack is intentional (withSerwist also injects a webpack config).
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.gutenberg.org",
      },
      {
        protocol: "https",
        hostname: "gutenberg.org",
      },
    ],
  },
};

// withSerwist adds esbuild + esbuild-wasm to serverExternalPackages so the
// Serwist route handler can bundle the service worker at request time.
export default withSerwist(nextConfig);
