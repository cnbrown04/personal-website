import type { Project } from "@site/kit";

// Every projects/<slug>/project.ts is picked up automatically.
// Folders starting with "_" (templates) are skipped.
const modules = import.meta.glob<Project>(
  ["../../../projects/*/project.ts", "!../../../projects/_*/project.ts"],
  { eager: true, import: "default" },
);

export const allProjects: Project[] = Object.values(modules).sort(
  (a, b) => (a.order ?? 100) - (b.order ?? 100) || (b.year ?? 0) - (a.year ?? 0),
);

export const listedProjects = allProjects.filter((p) => !p.draft);

export function findProject(slug: string): Project | undefined {
  return allProjects.find((p) => p.slug === slug);
}
