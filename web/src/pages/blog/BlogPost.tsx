import { MDXProvider } from "@mdx-js/react";
import { lazy, Suspense, useMemo } from "react";
import { useParams } from "react-router";
import { PageShell } from "@/components/PageShell";
import { posts } from "@/data/posts";
import { formatDate } from "@/lib/date";
import { NotFound } from "@/pages/NotFound";

// Lazy-load MDX by slug; each post is its own chunk.
const postModules = import.meta.glob<{ default: React.ComponentType }>(
  "../../../content/blog/*.mdx",
);

export function BlogPost() {
  const { slug = "" } = useParams();
  const meta = posts.find((p) => p.slug === slug);
  const loader = postModules[`../../../content/blog/${slug}.mdx`];
  const Content = useMemo(() => (loader ? lazy(loader) : null), [loader]);

  if (!meta || !Content) return <NotFound />;

  return (
    <PageShell back={{ to: "/blog", label: "Blog" }}>
      <article className="text-foreground">
        <header className="mb-6">
          <h1 className="text-foreground mb-0.5 text-2xl font-semibold">{meta.title}</h1>
          {meta.description && (
            <p className="text-muted-foreground mt-0.5 text-sm">{meta.description}</p>
          )}
          <div className="text-muted-foreground mt-0.5 text-sm">
            <time dateTime={meta.date}>{formatDate(meta.date)}</time>
            {meta.updated && (
              <>
                <span className="mx-1.5">·</span>
                <time dateTime={meta.updated}>Last updated {formatDate(meta.updated)}</time>
              </>
            )}
          </div>
        </header>

        <hr className="border-border my-6" />

        <div className="blog-content [&_h1]:mb-4 [&_h1]:text-2xl [&_h2]:mb-3 [&_h2]:text-xl [&_p]:mb-4 [&_ul]:list-inside [&_ul]:list-disc [&_ul]:mb-4 [&_:not(pre)_>_code]:rounded [&_:not(pre)_>_code]:bg-muted [&_:not(pre)_>_code]:px-1.5 [&_:not(pre)_>_code]:py-0.5 [&_:not(pre)_>_code]:text-sm [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-[#2d2d2d] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-sm">
          <MDXProvider>
            <Suspense fallback={null}>
              <Content />
            </Suspense>
          </MDXProvider>
        </div>
      </article>
    </PageShell>
  );
}
