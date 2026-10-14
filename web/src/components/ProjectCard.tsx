import { type Project, projectHref } from "@site/kit";
import { Link } from "react-router";

export function ProjectCard({ project }: { project: Project }) {
  const href = projectHref(project);
  const className =
    "group block rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/50";
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-foreground group-hover:underline">{project.title}</span>
        {project.year && <span className="text-muted-foreground text-xs">{project.year}</span>}
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{project.description}</p>
      {project.tags && project.tags.length > 0 && (
        <p className="text-muted-foreground mt-1 text-xs">{project.tags.join(" · ")}</p>
      )}
    </>
  );

  // Embedded projects route inside the SPA; everything else is a full page load.
  return (
    <li>
      {project.mode === "embedded" ? (
        <Link to={href} className={className}>
          {body}
        </Link>
      ) : (
        <a
          href={href}
          className={className}
          {...(project.mode === "external" && { target: "_blank", rel: "noreferrer noopener" })}
        >
          {body}
        </a>
      )}
    </li>
  );
}
