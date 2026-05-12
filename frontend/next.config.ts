import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow phone/LAN devices to hit the dev server during testing.
  allowedDevOrigins: ["192.168.1.68"],
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
