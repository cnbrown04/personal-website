import type { ComponentType } from "react";

interface ProjectBase {
  /** URL slug. Must match the folder name under `projects/`. */
  slug: string;
  title: string;
  description: string;
  tags?: string[];
  year?: number;
  /** Lower sorts first on the projects page. Defaults to 100. */
  order?: number;
  /** Hidden from listings but still reachable by URL. */
  draft?: boolean;
  links?: { repo?: string; demo?: string; writeup?: string };
}

/** Rendered inside the site shell at /projects/<slug>. */
export interface EmbeddedProject extends ProjectBase {
  mode: "embedded";
  load: () => Promise<{ default: ComponentType }>;
}

/** Its own Vite app, built to /p/<slug>/. */
export interface StandaloneProject extends ProjectBase {
  mode: "standalone";
}

/** Portfolio entry for work hosted elsewhere. */
export interface ExternalProject extends ProjectBase {
  mode: "external";
  url: string;
}

export type Project = EmbeddedProject | StandaloneProject | ExternalProject;

export function defineProject<T extends Project>(project: T): T {
  return project;
}

/** Where a project lives on the site. */
export function projectHref(project: Project): string {
  switch (project.mode) {
    case "embedded":
      return `/projects/${project.slug}`;
    case "standalone":
      return `/p/${project.slug}/`;
    case "external":
      return project.url;
  }
}
