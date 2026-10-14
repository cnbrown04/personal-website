import { type EmbeddedProject, projectHref } from "@site/kit";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageShell } from "@/components/PageShell";
import { NotFound } from "@/pages/NotFound";
import { findProject } from "@/projects/registry";

export function ProjectHost() {
  const { slug = "" } = useParams();
  const project = findProject(slug);

  // A standalone/external slug typed under /projects/ goes to its real home.
  useEffect(() => {
    if (project && project.mode !== "embedded") window.location.replace(projectHref(project));
  }, [project]);

  if (!project) return <NotFound />;
  if (project.mode !== "embedded") return null;
  return <Embedded key={project.slug} project={project} />;
}

function Embedded({ project }: { project: EmbeddedProject }) {
  const Component = useMemo(() => lazy(project.load), [project]);

  return (
    <PageShell back={{ to: "/projects", label: "Projects" }}>
      <article className="space-y-6">
        <header>
          <h1 className="text-foreground mb-0.5 text-2xl font-semibold">{project.title}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{project.description}</p>
          {project.links?.repo && (
            <a
              href={project.links.repo}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground mt-1 inline-block text-sm hover:underline"
            >
              Source →
            </a>
          )}
        </header>
        <ErrorBoundary
          fallback={(error) => (
            <div className="rounded-lg border border-destructive/40 bg-background p-4 text-sm">
              <p className="font-medium">This project crashed.</p>
              <pre className="text-muted-foreground mt-2 overflow-x-auto">{error.message}</pre>
            </div>
          )}
        >
          <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
            <Component />
          </Suspense>
        </ErrorBoundary>
      </article>
    </PageShell>
  );
}
