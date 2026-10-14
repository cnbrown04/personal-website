import { useEffect, useState } from "react";
import init, { count_primes, greet } from "../wasm/pkg/hello_wasm.js";

export default function HelloWasm() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("world");
  const [limit, setLimit] = useState(10_000_000);
  const [result, setResult] = useState<{ count: number; ms: number } | null>(null);

  useEffect(() => {
    init().then(() => setReady(true));
  }, []);

  if (!ready) return <p className="text-muted-foreground">Loading WASM…</p>;

  function run() {
    const start = performance.now();
    const count = count_primes(limit);
    setResult({ count, ms: performance.now() - start });
  }

  return (
    <div className="space-y-6 rounded-lg border border-border bg-background p-6">
      <label className="block space-y-2">
        <span className="text-sm text-muted-foreground">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </label>
      <p className="font-mono">{greet(name)}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-2">
          <span className="block text-sm text-muted-foreground">Count primes below</span>
          <input
            type="number"
            value={limit}
            min={0}
            max={200_000_000}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-48 rounded-md border border-input bg-background px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={run}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Run in WASM
        </button>
      </div>
      {result && (
        <p className="font-mono text-sm">
          {result.count.toLocaleString()} primes in {result.ms.toFixed(1)} ms
          {" · "}crossOriginIsolated: {String(window.crossOriginIsolated)}
        </p>
      )}
    </div>
  );
}
