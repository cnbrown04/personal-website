import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// Served by the site at /p/wavefield/.
export default defineConfig({
  base: "/p/wavefield/",
  plugins: [react()],
  build: {
    outDir: "../../dist/p/wavefield",
    emptyOutDir: true,
    target: "es2023",
  },
  server: { headers: isolationHeaders },
});
