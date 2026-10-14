import { defineProject } from "@site/kit";

export default defineProject({
  slug: "dither",
  title: "Dither",
  description:
    "Turn any image into 1-bit, Game Boy or PICO-8 art. Classic dithering algorithms written in Rust, running in the browser as WebAssembly.",
  tags: ["rust", "wasm", "image processing"],
  year: 2026,
  mode: "embedded",
  load: () => import("./src"),
});
