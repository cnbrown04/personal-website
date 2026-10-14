// Builds every projects/*/wasm crate into projects/*/wasm/pkg.
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { projectsWith, root } from "./lib.mjs";

const profile = process.argv.includes("--dev") ? "--dev" : "--release";

for (const dir of projectsWith("wasm/Cargo.toml")) {
  console.log(`wasm: ${relative(root, dir)}`);
  execFileSync(
    "wasm-pack",
    ["build", "wasm", "--target", "web", profile, "--no-pack", "--out-dir", "pkg"],
    { cwd: dir, stdio: "inherit" },
  );
}
