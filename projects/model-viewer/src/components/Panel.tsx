import { useMemo, useState } from "react";
import type { ParamHints } from "../hints";
import { LAYOUT_PARAMS } from "../layout/model";
import type { Params, Schema } from "../types";
import { Control, labelFor } from "./Control";

interface Props {
  schema: Schema;
  params: Params;
  /** Controls the model says are overridden (shown disabled) or need a warning. */
  hints?: ParamHints;
  onChange: (patch: Params) => void;
  onResetAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The compartment layout is edited in the 3D view, not as raw fields. */
  hideLayoutParams?: boolean;
  /** Rendered above the parameter list. */
  presets?: React.ReactNode;
  compartments?: React.ReactNode;
  /** `format` is a key of EXPORTS. */
  onExport: (format: string, scope: ExportScope) => void;
  exporting: string | null;
  /** Offer box-only and bin-only downloads (the Gridfinity bin is on). */
  canExportBin?: boolean;
}

/** "all" is the box and the Gridfinity bin, as separate files. */
export type ExportScope = "all" | "box" | "bin";

const EXPORTS = [
  ["stl", "STL"],
  ["3mf", "3MF (color)"],
  ["obj", "OBJ"],
  ["step", "STEP (exact curves)"],
] as const;

const SCOPES: [ExportScope, string][] = [
  ["all", "Everything (Box and Bin as Two Files)"],
  ["box", "Box Only"],
  ["bin", "Gridfinity Bin Only"],
];

/** `clamshell.scad` -> "Clamshell". */
function titleOf(file: string): string {
  const stem = file.replace(/\.scad$/i, "").replace(/[_-]+/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

// These are owned by the layout editor rather than shown as raw fields.
const EDITOR_OWNED = new Set<string>([...LAYOUT_PARAMS, "lid_dividers", "fills", "tools"]);

export function Panel({
  schema,
  params,
  hints,
  onChange,
  onResetAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hideLayoutParams,
  presets,
  compartments,
  onExport,
  exporting,
  canExportBin,
}: Props) {
  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      schema.params.filter((p) => {
        if (hideLayoutParams && EDITOR_OWNED.has(p.name)) return false;
        // Viewer plumbing (render parts), never user settings.
        if (p.name.startsWith("mv_")) return false;
        if (p.hidden && !showAdvanced) return false;
        if (!needle) return true;
        return (
          p.name.toLowerCase().includes(needle) ||
          labelFor(p.name).toLowerCase().includes(needle) ||
          p.group.toLowerCase().includes(needle) ||
          (p.description ?? "").toLowerCase().includes(needle)
        );
      }),
    [schema.params, needle, showAdvanced, hideLayoutParams],
  );

  const groups = schema.groups.filter((g) => visible.some((p) => p.group === g.name));
  const modifiedCount = schema.params.filter(
    (p) => JSON.stringify(params[p.name]) !== JSON.stringify(p.default),
  ).length;

  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <h1>{titleOf(schema.file)}</h1>
          <p className="sub">
            {modifiedCount === 0
              ? "Default settings"
              : `${modifiedCount} setting${modifiedCount === 1 ? "" : "s"} changed`}
          </p>
        </div>
        <div className="panel-head-actions">
          <div className="panel-head-row">
            <button
              type="button"
              className="history-btn"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              ↶
            </button>
            <button
              type="button"
              className="history-btn"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
            >
              ↷
            </button>
            <button type="button" onClick={onResetAll} disabled={modifiedCount === 0}>
              Reset all
            </button>
          </div>
          <select
            value=""
            onChange={(e) => {
              const [scope, format] = e.target.value.split(":");
              if (format) onExport(format, scope as ExportScope);
              e.target.value = "";
            }}
            disabled={Boolean(exporting)}
          >
            <option value="">{exporting ? `exporting ${exporting}…` : "Download…"}</option>
            {canExportBin
              ? SCOPES.map(([scope, title]) => (
                  <optgroup key={scope} label={title}>
                    {EXPORTS.map(([value, label]) => (
                      <option key={value} value={`${scope}:${value}`}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                ))
              : EXPORTS.map(([value, label]) => (
                  <option key={value} value={`all:${value}`}>
                    {label}
                  </option>
                ))}
          </select>
        </div>
      </header>

      {presets}
      {compartments}

      <div className="panel-tools">
        <input
          type="search"
          placeholder="Search settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="inline">
          <input
            type="checkbox"
            checked={showAdvanced}
            onChange={(e) => setShowAdvanced(e.target.checked)}
          />
          Advanced
        </label>
      </div>

      {groups.map((group) => {
        const items = visible.filter((p) => p.group === group.name);
        const isCollapsed = collapsed[group.name] ?? false;
        return (
          <section key={group.name} className={group.hidden ? "group advanced" : "group"}>
            <button
              type="button"
              className="group-head"
              onClick={() => setCollapsed((c) => ({ ...c, [group.name]: !isCollapsed }))}
            >
              <span className="chev">{isCollapsed ? "▸" : "▾"}</span>
              <span>{group.name === "Hidden" ? "Internal" : group.name}</span>
            </button>
            {!isCollapsed && (
              <div className="group-body">
                {group.description && <p className="group-desc">{group.description}</p>}
                {items.map((p) => (
                  <Control
                    key={p.name}
                    param={p}
                    value={params[p.name] ?? p.default}
                    hint={hints?.[p.name]}
                    onChange={(v) => onChange({ [p.name]: v })}
                    onReset={() => onChange({ [p.name]: p.default })}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {groups.length === 0 && <p className="empty">No settings match “{query}”.</p>}
    </aside>
  );
}
