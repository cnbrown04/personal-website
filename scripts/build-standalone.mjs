// Builds every standalone project (any project with its own vite.config.ts)
// into dist/p/<slug>/. Run after the web build, which empties dist/.
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { projectsWith, root } from "./lib.mjs";

for (const dir of projectsWith("vite.config.ts")) {
  console.log(`standalone: ${relative(root, dir)}`);
  execFileSync("npm", ["run", "build"], { cwd: dir, stdio: "inherit" });
}
