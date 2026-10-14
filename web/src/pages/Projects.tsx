import { PageShell } from "@/components/PageShell";
import { ProjectCard } from "@/components/ProjectCard";
import { listedProjects } from "@/projects/registry";

export function Projects() {
  return (
    <PageShell back={{ to: "/", label: "Home" }}>
      <h1 className="text-foreground mb-8 text-2xl font-semibold">Projects</h1>
      {listedProjects.length === 0 ? (
        <p className="text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {listedProjects.map((p) => (
            <ProjectCard key={p.slug} project={p} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
