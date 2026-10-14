import { useMemo, useRef, useState } from "react";
import * as api from "../api";
import * as L from "../layout/model";
import type { Params, Preset, Schema } from "../types";

interface Props {
  schema: Schema;
  params: Params;
  presets: Preset[];
  onPresets: (next: Preset[]) => void;
  /** Replace the whole configuration with a preset's values. */
  onApply: (params: Params) => void;
  activeName: string | null;
  onActiveName: (name: string | null) => void;
}

type Editing =
  | { kind: "new"; name: string; description: string; confirmReplace?: boolean }
  | { kind: "rename"; target: string; name: string }
  | { kind: "delete"; target: string }
  | null;

const EPS = 1e-6;

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < EPS;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  return a === b;
}

function defaultsOf(schema: Schema): Params {
  return Object.fromEntries(schema.params.map((p) => [p.name, p.default]));
}

/** What a preset expands to: file defaults overlaid with the preset's values. */
export function effectiveParams(schema: Schema, preset: Preset): Params {
  const out = defaultsOf(schema);
  for (const [k, v] of Object.entries(preset.params)) if (k in out) out[k] = v;
  return out;
}

function matches(schema: Schema, params: Params, preset: Preset): boolean {
  const eff = effectiveParams(schema, preset);
  return schema.params.every((p) => sameValue(params[p.name] ?? p.default, eff[p.name]));
}

/** Everything visible, plus any advanced value that was changed from the file default. */
function paramsToStore(schema: Schema, params: Params): Params {
  const out: Params = {};
  for (const p of schema.params) {
    const v = params[p.name] ?? p.default;
    if (!p.hidden || !sameValue(v, p.default)) out[p.name] = v;
  }
  return out;
}

/** Accepts our own export, a bare array, or an OpenSCAD Customizer parameter-set file. */
function parseImport(
  schema: Schema,
  text: string,
): { name: string; params: Params; description?: string }[] {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : Array.isArray(data?.presets) ? data.presets : null;
  if (list) {
    return list
      .filter(
        (p: unknown): p is Preset =>
          !!p && typeof (p as Preset).name === "string" && typeof (p as Preset).params === "object",
      )
      .map((p: Preset) => ({ name: p.name, params: p.params, description: p.description }));
  }
  if (data?.parameterSets && typeof data.parameterSets === "object") {
    const kinds = new Map(schema.params.map((p) => [p.name, p.kind]));
    return Object.entries(data.parameterSets as Record<string, Record<string, unknown>>).map(
      ([name, set]) => {
        const params: Params = {};
        for (const [k, raw] of Object.entries(set)) {
          const kind = kinds.get(k);
          if (!kind) continue;
          // OpenSCAD writes every value as a string.
          if (kind === "number") params[k] = Number(raw);
          else if (kind === "bool") params[k] = raw === true || raw === "true";
          else if (kind === "vector")
            params[k] = typeof raw === "string" ? JSON.parse(raw) : (raw as number[]);
          else params[k] = String(raw);
        }
        return { name, params };
      },
    );
  }
  throw new Error("Not a presets file");
}

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, "_");

export function PresetManager({
  schema,
  params,
  presets,
  onPresets,
  onApply,
  activeName,
  onActiveName,
}: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const allBuiltins = presets.filter((p) => p.builtin);
  const allMine = presets.filter((p) => !p.builtin);
  const hiddenCount = presets.filter((p) => p.hidden).length;
  const visible = (p: Preset) => showHidden || !p.hidden;
  const builtins = allBuiltins.filter(visible);
  const mine = allMine.filter(visible);
  const setHidden = (names: string[], hidden: boolean) =>
    run(() => api.setPresetVisibility(names, hidden));
  const matching = useMemo(
    () => new Set(presets.filter((p) => matches(schema, params, p)).map((p) => p.name)),
    [presets, schema, params],
  );
  const active = presets.find((p) => p.name === activeName) ?? null;
  const modified = active !== null && !matching.has(active.name);

  const run = async (work: () => Promise<Preset[] | void>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      if (next) onPresets(next);
      return true;
    } catch (e) {
      if (e instanceof api.PresetConflict) throw e;
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveNew = async (overwrite: boolean) => {
    if (editing?.kind !== "new") return;
    const name = editing.name.trim();
    if (!name) return;
    try {
      const ok = await run(() =>
        api.savePreset(
          {
            name,
            params: paramsToStore(schema, params),
            description: editing.description.trim() || undefined,
          },
          overwrite,
        ),
      );
      if (ok) {
        onActiveName(name);
        setEditing(null);
      }
    } catch (e) {
      if (e instanceof api.PresetConflict) {
        if (builtins.some((b) => b.name === name))
          setError(`“${name}” is built in — pick another name.`);
        else setEditing({ ...editing, confirmReplace: true });
      }
    }
  };

  const update = (preset: Preset) =>
    run(() =>
      api.savePreset(
        {
          name: preset.name,
          params: paramsToStore(schema, params),
          description: preset.description,
        },
        true,
      ),
    ).then((ok) => ok && onActiveName(preset.name));

  const duplicate = (preset: Preset) => {
    const taken = new Set(presets.map((p) => p.name));
    let name = `${preset.name} copy`;
    for (let n = 2; taken.has(name); n++) name = `${preset.name} copy ${n}`;
    return run(() =>
      api.savePreset({
        name,
        params: paramsToStore(schema, effectiveParams(schema, preset)),
        description: preset.description,
      }),
    ).then((ok) => {
      if (ok) {
        onApply(effectiveParams(schema, preset));
        onActiveName(name);
        setEditing({ kind: "rename", target: name, name });
      }
    });
  };

  const onImport = async (file: File) => {
    try {
      const entries = parseImport(schema, await file.text());
      if (!entries.length) throw new Error("No presets in that file");
      await run(() => api.importPresets(entries));
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const row = (preset: Preset) => {
    const isMatch = matching.has(preset.name);
    const isActive = preset.name === activeName;
    const renaming = editing?.kind === "rename" && editing.target === preset.name;
    const deleting = editing?.kind === "delete" && editing.target === preset.name;
    const eff = effectiveParams(schema, preset);

    return (
      <li
        key={preset.name}
        className={`preset ${isMatch ? "match" : ""} ${isActive ? "active" : ""} ${preset.hidden ? "is-hidden" : ""}`}
        onMouseLeave={() => menu === preset.name && setMenu(null)}
      >
        <button
          type="button"
          className="preset-main"
          disabled={renaming || busy}
          onClick={() => {
            onApply(eff);
            onActiveName(preset.name);
            setMenu(null);
          }}
          title={preset.description ?? "Apply preset"}
        >
          <Thumb params={eff} />
          <span className="preset-text">
            {renaming ? (
              <input
                autoFocus
                value={editing.name}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setEditing(null);
                  if (e.key === "Enter" && editing.name.trim()) {
                    const newName = editing.name.trim();
                    void run(() => api.renamePreset(preset.name, newName)).then((ok) => {
                      if (ok) {
                        if (activeName === preset.name) onActiveName(newName);
                        setEditing(null);
                      }
                    });
                  }
                }}
              />
            ) : (
              <strong>
                {preset.name}
                {isActive && modified && <em className="preset-flag">modified</em>}
                {preset.hidden && <em className="preset-flag hidden-flag">hidden</em>}
              </strong>
            )}
            <small>{summary(eff)}</small>
          </span>
          {isMatch && (
            <span className="preset-check" aria-label="current">
              ✓
            </span>
          )}
        </button>

        {deleting ? (
          <span className="preset-confirm">
            Delete?
            <button
              type="button"
              className="danger"
              onClick={() =>
                run(() => api.deletePreset(preset.name)).then(() => {
                  if (activeName === preset.name) onActiveName(null);
                  setEditing(null);
                })
              }
            >
              Yes
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              No
            </button>
          </span>
        ) : (
          <span className="preset-actions">
            {preset.hidden && (
              <button
                type="button"
                onClick={() => setHidden([preset.name], false)}
                title="Show this preset in the list again"
              >
                Unhide
              </button>
            )}
            {!preset.builtin && isActive && modified && (
              <button
                type="button"
                className="primary"
                onClick={() => update(preset)}
                title="Save the current settings into this preset"
              >
                Update
              </button>
            )}
            <button
              type="button"
              className="preset-more"
              onClick={() => setMenu(menu === preset.name ? null : preset.name)}
              aria-label="More"
            >
              ⋯
            </button>
          </span>
        )}

        {menu === preset.name && (
          <div className="preset-menu" onClick={() => setMenu(null)}>
            {!preset.builtin && (
              <>
                <button type="button" onClick={() => update(preset)}>
                  Overwrite with current settings
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditing({ kind: "rename", target: preset.name, name: preset.name })
                  }
                >
                  Rename
                </button>
              </>
            )}
            <button type="button" onClick={() => duplicate(preset)}>
              {preset.builtin ? "Copy to my presets" : "Duplicate"}
            </button>
            <button
              type="button"
              onClick={() => download(`${fileSafe(preset.name)}.preset.json`, [preset])}
            >
              Download
            </button>
            <button type="button" onClick={() => setHidden([preset.name], !preset.hidden)}>
              {preset.hidden ? "Unhide" : "Hide from list"}
            </button>
            {!preset.builtin && (
              <button
                type="button"
                className="danger"
                onClick={() => setEditing({ kind: "delete", target: preset.name })}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="presets-panel">
      <div className="presets-head">
        <span>Presets</span>
        <span className="presets-tools">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Import presets (.json, including OpenSCAD parameter sets)"
          >
            Import
          </button>
          <button
            type="button"
            disabled={!mine.length}
            onClick={() => download(`${fileSafe(schema.file)}.presets.json`, mine)}
            title="Download your presets"
          >
            Export
          </button>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </div>

      {editing?.kind === "new" ? (
        <div className="preset-form">
          <input
            autoFocus
            placeholder="Preset name"
            value={editing.name}
            maxLength={80}
            onChange={(e) =>
              setEditing({ ...editing, name: e.target.value, confirmReplace: false })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveNew(Boolean(editing.confirmReplace));
              if (e.key === "Escape") setEditing(null);
            }}
          />
          <input
            placeholder="Description (optional)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveNew(Boolean(editing.confirmReplace));
              if (e.key === "Escape") setEditing(null);
            }}
          />
          {editing.confirmReplace ? (
            <div className="preset-form-row warn">
              “{editing.name.trim()}” exists.
              <button type="button" className="danger" onClick={() => saveNew(true)}>
                Replace
              </button>
              <button
                type="button"
                onClick={() => setEditing({ ...editing, confirmReplace: false })}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="preset-form-row">
              <button
                type="button"
                className="primary"
                disabled={!editing.name.trim() || busy}
                onClick={() => saveNew(false)}
              >
                Save preset
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="preset-save"
          onClick={() =>
            setEditing({
              kind: "new",
              name: active && !active.builtin ? `${active.name} 2` : "",
              description: "",
            })
          }
        >
          + Save current settings as a preset
        </button>
      )}

      {error && (
        <p className="preset-error" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      {mine.length > 0 && (
        <>
          <h4>My presets</h4>
          <ul className="preset-list">{mine.map(row)}</ul>
        </>
      )}
      {allBuiltins.length > 0 && (
        <h4 className="presets-subhead">
          Built in
          {allBuiltins.some((p) => !p.hidden) && (
            <button
              type="button"
              className="link"
              onClick={() =>
                setHidden(
                  allBuiltins.filter((p) => !p.hidden).map((p) => p.name),
                  true,
                )
              }
              title="Hide every built-in preset from the list"
            >
              hide all
            </button>
          )}
        </h4>
      )}
      {builtins.length > 0 && <ul className="preset-list">{builtins.map(row)}</ul>}
      {hiddenCount > 0 && (
        <button
          type="button"
          className="presets-hidden-toggle"
          onClick={() => setShowHidden((v) => !v)}
        >
          {showHidden
            ? "Don’t show hidden presets"
            : `${hiddenCount} hidden preset${hiddenCount === 1 ? "" : "s"} · show`}
        </button>
      )}
    </section>
  );
}

function summary(p: Params): string {
  const parts: string[] = [];
  if (typeof p.width === "number" && typeof p.depth === "number" && typeof p.height === "number") {
    parts.push(`${p.width} × ${p.depth} × ${p.height} mm`);
  }
  if (L.supportsLayout(Object.keys(p))) {
    const n = L.regions(L.fromParams(p)).length;
    parts.push(`${n} compartment${n === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/** Top-down sketch of the box with its dividers, hinge at the bottom. */
function Thumb({ params }: { params: Params }) {
  const w = Number(params.width) || 1;
  const d = Number(params.depth) || 1;
  const scale = 36 / Math.max(w, d);
  const bw = w * scale;
  const bd = d * scale;
  const x0 = (40 - bw) / 2;
  const y0 = (40 - bd) / 2;
  const hasLayout = L.supportsLayout(Object.keys(params));
  const layout = hasLayout ? L.fromParams(params) : null;
  const X = layout ? L.xLines(layout) : [];
  const Y = layout ? L.yLines(layout) : [];
  return (
    <svg className="preset-thumb" viewBox="0 0 40 40" aria-hidden>
      <rect x={x0} y={y0} width={bw} height={bd} rx={2} className="thumb-box" />
      {layout &&
        L.walls(layout).map((wall, i) =>
          wall.axis === "x" ? (
            <line
              key={i}
              x1={x0 + X[wall.line] * bw}
              x2={x0 + X[wall.line] * bw}
              y1={y0 + (1 - Y[wall.index + 1]) * bd}
              y2={y0 + (1 - Y[wall.index]) * bd}
            />
          ) : (
            <line
              key={i}
              y1={y0 + (1 - Y[wall.line]) * bd}
              y2={y0 + (1 - Y[wall.line]) * bd}
              x1={x0 + X[wall.index] * bw}
              x2={x0 + X[wall.index + 1] * bw}
            />
          ),
        )}
    </svg>
  );
}
