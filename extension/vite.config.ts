import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // Don't try to open the SPA — extension dev workflow is "load
    // unpacked" via chrome://extensions, not a localhost page.
    open: false,
    port: 5174,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
  build: {
    // Keep generated chunks small + readable since users may inspect
    // the unpacked extension on disk.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Stable file names so the manifest references resolve cleanly.
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
