// Usage: mise run new <slug> [--standalone] [--wasm]
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectsDir, root } from "./lib.mjs";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const mode = args.includes("--standalone") ? "standalone" : "embedded";
const withWasm = args.includes("--wasm");

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error("Usage: mise run new <kebab-case-slug> [--standalone] [--wasm]");
  process.exit(1);
}

const dest = join(projectsDir, slug);
if (existsSync(dest)) {
  console.error(`projects/${slug} already exists`);
  process.exit(1);
}

const words = slug.split("-");
const vars = {
  slug,
  title: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
  component: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(""),
  crate: slug.replaceAll("-", "_"),
  year: String(new Date().getFullYear()),
};

cpSync(join(root, "templates", mode), dest, { recursive: true });
if (withWasm) cpSync(join(root, "templates", "wasm"), join(dest, "wasm"), { recursive: true });

function fill(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) fill(path);
    else {
      const text = readFileSync(path, "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
      writeFileSync(path, text);
    }
  }
}
fill(dest);

execFileSync("npm", ["install"], { cwd: root, stdio: "inherit" });
console.log(`\nCreated projects/${slug} (${mode}${withWasm ? " + wasm" : ""}).`);
console.log(mode === "embedded" ? `Visit /projects/${slug}` : `Visit /p/${slug}/`);
