import { defineProject } from "@site/kit";

export default defineProject({
  slug: "model-viewer",
  title: "Clamshell Box Configurator",
  description:
    "Design a 3D-printable parts box in the browser. OpenSCAD runs as WebAssembly on your own CPU cores, and the model is drawn on your GPU with WebGPU.",
  tags: ["openscad", "wasm", "webgpu", "three.js", "rust"],
  year: 2026,
  mode: "standalone",
  links: { repo: "https://github.com/cnbrown04/model-viewer" },
});
