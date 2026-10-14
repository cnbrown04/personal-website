import { PageShell } from "@/components/PageShell";

export function NotFound() {
  return (
    <PageShell back={{ to: "/", label: "Home" }}>
      <h1 className="text-foreground mb-2 text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">That page doesn't exist.</p>
    </PageShell>
  );
}
