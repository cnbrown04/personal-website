import { Link } from "react-router";
import { PageShell } from "@/components/PageShell";
import { posts } from "@/data/posts";
import { formatDate } from "@/lib/date";

export function BlogIndex() {
  return (
    <PageShell back={{ to: "/", label: "Home" }}>
      <h1 className="text-foreground mb-8 text-2xl font-semibold">Blog</h1>

      <ul className="flex flex-col gap-6">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to={`/blog/${post.slug}`}
              className="group block rounded-lg border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="font-medium text-foreground group-hover:underline">
                {post.title}
              </span>
              <p className="text-muted-foreground mt-1 text-sm">{post.description}</p>
              <div className="text-muted-foreground mt-1 text-xs">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                {post.updated && (
                  <>
                    <span className="mx-1.5">·</span>
                    <time dateTime={post.updated}>Last updated {formatDate(post.updated)}</time>
                  </>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
