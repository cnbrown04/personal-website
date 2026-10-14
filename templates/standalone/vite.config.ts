import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// Served by the site at /p/{{slug}}/.
export default defineConfig({
  base: "/p/{{slug}}/",
  plugins: [react()],
  build: {
    outDir: "../../dist/p/{{slug}}",
    emptyOutDir: true,
    target: "es2023",
  },
  server: { headers: isolationHeaders },
});
