import type { ReactNode } from "react";
import { Link } from "react-router";

/** Content column + back link, shared by every page except home. */
export function PageShell({
  back,
  children,
}: {
  back?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-16 pt-2.5">
      {back && (
        <nav className="mb-8">
          <Link to={back.to} className="text-muted-foreground text-sm hover:underline">
            ← {back.label}
          </Link>
        </nav>
      )}
      {children}
    </main>
  );
}
