import { defineProject } from "@site/kit";

export default defineProject({
  slug: "hello-wasm",
  title: "Hello WASM",
  description: "Example project: a Rust crate compiled to WebAssembly and called from React.",
  tags: ["rust", "wasm", "react"],
  year: 2026,
  mode: "embedded",
  load: () => import("./src"),
});
