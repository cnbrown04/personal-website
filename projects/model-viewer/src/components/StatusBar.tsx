import { useState } from "react";
import type { RenderStats } from "../types";

interface Props {
  stats: RenderStats | null;
  busy: boolean;
  elapsed: number;
  error: string | null;
  /** GPU API drawing the view, once known. */
  gpu?: string;
}

export function StatusBar({ stats, error, gpu }: Props) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="statusbar">
      {error && <span className="status-text bad">render failed</span>}

      {stats && !error && (
        <>
          <Metric label="size" value={`${stats.size.map((v) => v.toFixed(1)).join(" × ")} mm`} />
          <Metric label="volume" value={`${(stats.volume / 1000).toFixed(1)} cm³`} />
          <Metric
            label="render"
            value={stats.cached ? "cached" : `${Math.round(stats.renderMs)} ms`}
            title={[
              ...Object.entries(stats.parts).map(
                ([name, v]) => `${name}: ${v === "cached" ? "cached" : `${v} ms`}`,
              ),
              `${stats.triangles.toLocaleString()} triangles, ${(stats.area / 100).toFixed(1)} cm²`,
              `decode ${stats.decodeMs.toFixed(1)} ms, display ${stats.displayMs.toFixed(0)} ms`,
              ...(gpu ? [`gpu: ${gpu}`] : []),
            ].join("\n")}
          />
        </>
      )}

      <button type="button" className="log-toggle" onClick={() => setShowLog((s) => !s)}>
        {showLog ? "hide log" : "log"}
      </button>

      {showLog && (
        <pre className="log">
          {error ? `${error}\n\n${stats?.log ?? ""}` : stats?.log || "no output"}
        </pre>
      )}
      {error && !showLog && <span className="error-brief">{error.split("\n")[0]}</span>}
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <span className="metric" title={title}>
      <em>{label}</em>
      {value}
    </span>
  );
}
