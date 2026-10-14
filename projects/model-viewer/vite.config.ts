import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cross-origin isolation is required: OpenSCAD runs as WebAssembly in workers.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// Served by the site at /p/model-viewer/.
export default defineConfig({
  base: "/p/model-viewer/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    outDir: "../../dist/p/model-viewer",
    emptyOutDir: true,
    target: "es2023",
  },
  server: { headers: isolationHeaders },
});
