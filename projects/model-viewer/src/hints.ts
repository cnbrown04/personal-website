// Parameter hints the model reports while rendering, as
// `ECHO: "MV_HINTS=[["name", "off" | "note", "why"], ...]"`. The model knows
// which settings its other settings override, so it says which controls do
// nothing right now ("off": shown disabled) or deserve a warning ("note").

export interface ParamHint {
  off: boolean;
  reason: string;
}

export type ParamHints = Record<string, ParamHint>;

export function parseHints(log: string): ParamHints {
  const line = log.split("\n").find((l) => l.includes("MV_HINTS="));
  if (!line) return {};
  const json = line.slice(line.indexOf("MV_HINTS=") + "MV_HINTS=".length).replace(/"\s*$/, "");
  const hints: ParamHints = {};
  try {
    for (const entry of JSON.parse(json) as unknown[]) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const [name, kind, reason] = entry;
      if (typeof name !== "string" || typeof reason !== "string") continue;
      hints[name] = { off: kind === "off", reason };
    }
  } catch {
    // A malformed line just means no hints.
  }
  return hints;
}
