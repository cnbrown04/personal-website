import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const projectsDir = join(root, "projects");

/** Project folders that contain `file` (relative to the project). */
export function projectsWith(file) {
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(projectsDir, d.name, file)))
    .map((d) => join(projectsDir, d.name));
}
