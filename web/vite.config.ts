import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import rehypePrism from "rehype-prism-plus";
import remarkFrontmatter from "remark-frontmatter";
import { defineConfig } from "vite";
import { standaloneDev } from "./vite.standalone.ts";

// Keep in sync with server/src/routes/site.rs so dev behaves like prod.
// Cross-origin isolation enables SharedArrayBuffer and WASM threads.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        remarkPlugins: [remarkFrontmatter],
        rehypePlugins: [[rehypePrism, { ignoreMissing: true }]],
      }),
    },
    react({ include: /\.(jsx|js|tsx|ts|mdx|md)$/ }),
    tailwindcss(),
    standaloneDev(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2023",
  },
  server: {
    port: 5173,
    headers: isolationHeaders,
    proxy: { "/api": "http://localhost:3000" },
  },
  preview: { headers: isolationHeaders },
});
