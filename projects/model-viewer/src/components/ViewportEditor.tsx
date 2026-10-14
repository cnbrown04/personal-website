import { forwardRef, useEffect, useRef, useState } from "react";
import * as api from "../api";
import * as I from "../layout/inserts";
import * as L from "../layout/model";
import type { EditPatch } from "../layout/useLayoutHistory";
import type { LayoutFrame, ToolMode, ToolSelection } from "../viewer/LayoutTool";

interface Props {
  ready: boolean;
  layout: L.Layout;
  frame: LayoutFrame | null;
  mode: ToolMode;
  snap: number;
  selection: ToolSelection;
  onSelection: (sel: ToolSelection) => void;
  commit: (patch: EditPatch, keepSelection?: boolean) => void;
  fills: I.Fill[];
  tools: I.Tool[];
  toolMeshes: Map<string, I.ToolMesh>;
  insertsEnabled: boolean;
  uploads: api.Upload[];
  onUploaded: () => void;
  ensureToolMesh: (file: string, name?: string) => Promise<I.ToolMesh | null>;
  onSelectAfterCommit: (sel: ToolSelection) => void;
  onError: (message: string) => void;
}

const fmt = (mm: number) =>
  Math.abs(mm - Math.round(mm)) < 0.05 ? `${Math.round(mm)}` : mm.toFixed(1);

interface SectionProps {
  layout: L.Layout;
  frame: LayoutFrame | null;
  mode: ToolMode;
  onMode: (mode: ToolMode) => void;
  snap: number;
  onSnap: (mm: number) => void;
  lidDividers: boolean | undefined;
  onLidDividers: (on: boolean) => void;
  commit: (patch: EditPatch, keepSelection?: boolean) => void;
  onFocus: () => void;
}

/** Whole-layout settings, shown in the sidebar; per-compartment actions live on the model. */
export function CompartmentsSection(props: SectionProps) {
  const { layout, frame, mode, onMode, snap, onSnap, lidDividers, onLidDividers } = props;
  const C = L.colCount(layout);
  const R = L.rowCount(layout);
  const count = L.regions(layout).length;

  return (
    <section className="compartments-panel">
      <div className="compartments-head">
        <span>Compartments</span>
        <span className="vp-count">{count}</span>
      </div>

      <div className="vp-row">
        <Stepper
          label="across"
          value={C}
          onChange={(n) => props.commit({ layout: L.evenGrid(n, R) })}
        />
        <Stepper
          label="deep"
          value={R}
          onChange={(n) => props.commit({ layout: L.evenGrid(C, n) })}
        />
      </div>

      <div className="vp-row">
        <ToolButton
          on={mode === "select"}
          onClick={() => onMode("select")}
          title="Select & move (S)"
        >
          <svg viewBox="0 0 16 16">
            <path className="fill" d="M3 2l9 5-4 1 2.5 5-1.8.8L6.2 9 3 12z" />
          </svg>
        </ToolButton>
        <ToolButton
          on={mode === "split-x"}
          onClick={() => onMode("split-x")}
          title="Split side-to-side (V)"
        >
          <svg viewBox="0 0 16 16">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <path d="M8 2v12" />
          </svg>
        </ToolButton>
        <ToolButton
          on={mode === "split-y"}
          onClick={() => onMode("split-y")}
          title="Split front-to-back (H)"
        >
          <svg viewBox="0 0 16 16">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <path d="M2 8h12" />
          </svg>
        </ToolButton>
        <button
          type="button"
          className="vp-tool"
          onClick={props.onFocus}
          title="Look into the base (F)"
        >
          <svg viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="4.5" />
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => props.commit({ layout: L.equalize(layout) }, true)}
          title="Even spacing, keep combined compartments"
        >
          Equalize
        </button>
      </div>

      <div className="vp-row">
        <label className="vp-inline" title="Snap divider positions">
          snap
          <select value={snap} onChange={(e) => onSnap(Number(e.target.value))}>
            <option value={0}>off</option>
            <option value={0.5}>0.5</option>
            <option value={1}>1 mm</option>
            <option value={5}>5 mm</option>
          </select>
        </label>
        {lidDividers !== undefined && (
          <label className="vp-inline">
            <input
              type="checkbox"
              checked={lidDividers}
              onChange={(e) => onLidDividers(e.target.checked)}
            />
            same layout in lid
          </label>
        )}
      </div>

      {frame && (
        <div className="vp-foot">
          interior {fmt(frame.w)} × {fmt(frame.d)} × {fmt(frame.h)} mm
        </div>
      )}
    </section>
  );
}

/** Controls drawn over the 3D viewport while editing compartments. */
export function ViewportEditor(props: Props & { actionRef: React.Ref<HTMLDivElement> }) {
  const { ready, mode } = props;
  return (
    <>
      <ActionBar {...props} ref={props.actionRef} />

      <div className="vp-hint">
        {!ready
          ? "Waiting for the first render…"
          : mode === "select"
            ? "Click a compartment · Shift-click to add · drag walls and tools to move them · drag a tool’s knob to turn it"
            : "Click inside a compartment to split it · Shift splits the whole box · Alt ignores snap · Esc to finish"}
      </div>
    </>
  );
}

const ActionBar = forwardRef<HTMLDivElement, Props>(function ActionBar(props, ref) {
  const {
    selection,
    layout,
    frame,
    commit,
    onSelection,
    fills,
    tools,
    toolMeshes,
    insertsEnabled,
  } = props;
  const [picker, setPicker] = useState(false);
  const W = frame?.w ?? 1;
  const D = frame?.d ?? 1;
  const maxFill = frame ? Math.max(1, frame.h - 0.2) : 10;
  const regions = L.regions(layout);

  useEffect(() => setPicker(false), [selection]);

  let body: React.ReactNode = null;
  if (selection?.kind === "regions") {
    const ids = selection.ids.filter((id) => regions.some((r) => r.id === id));
    const selected = regions.filter((r) => ids.includes(r.id));
    if (selected.length) {
      const one = selected.length === 1 ? selected[0] : null;
      const fillIndex = selected.map((r) => I.fillFor(layout, fills, r.id));
      const allFilled = fillIndex.every((i) => i >= 0);
      const anyFilled = fillIndex.some((i) => i >= 0);
      body = (
        <>
          <span className="vp-sel">
            {one
              ? one.rectangular
                ? `${fmt((one.x1 - one.x0) * W)} × ${fmt((one.y1 - one.y0) * D)} mm`
                : `${fmt((one.area * W * D) / 100)} cm²`
              : `${selected.length} selected`}
          </span>
          {selected.length > 1 && (
            <button
              type="button"
              className="primary"
              onClick={() => commit({ layout: L.merge(layout, ids) })}
              title="M"
            >
              Combine
            </button>
          )}
          {selected.some((r) => r.cells.length > 1) && (
            <button
              type="button"
              onClick={() => commit({ layout: L.unmerge(layout, ids) })}
              title="U"
            >
              Break apart
            </button>
          )}
          {one && !anyFilled && (
            <>
              <button
                type="button"
                title="Split in half side-to-side"
                onClick={() =>
                  commit({ layout: L.addLine(layout, "x", (one.x0 + one.x1) / 2, one.id) })
                }
              >
                ◫ Halve
              </button>
              <button
                type="button"
                title="Split in half front-to-back"
                onClick={() =>
                  commit({ layout: L.addLine(layout, "y", (one.y0 + one.y1) / 2, one.id) })
                }
              >
                ⊟ Halve
              </button>
            </>
          )}
          {insertsEnabled && frame && !allFilled && (
            <button
              type="button"
              className="primary"
              title="Fill solid, then press tools into it"
              onClick={() => {
                const height = Math.max(3, Math.round(maxFill - 2));
                const added = selected
                  .filter((r) => I.fillFor(layout, fills, r.id) < 0)
                  .map((r) => ({ fx: r.label.x, fy: r.label.y, height }));
                commit({ fills: [...fills, ...added] }, true);
              }}
            >
              ▣ Shadowbox
            </button>
          )}
          {insertsEnabled && frame && allFilled && (
            <>
              <NumberField
                key={`fill-${ids.join()}-${fills[fillIndex[0]].height}`}
                value={fills[fillIndex[0]].height}
                min={0.5}
                max={maxFill}
                step={0.5}
                suffix="mm fill"
                onSubmit={(h) => {
                  const next = [...fills];
                  for (const i of fillIndex)
                    next[i] = { ...next[i], height: Math.min(maxFill, Math.max(0.5, h)) };
                  commit({ fills: next }, true);
                }}
              />
              {one && (
                <span className="vp-picker-anchor">
                  <button type="button" className="primary" onClick={() => setPicker((v) => !v)}>
                    ＋ Tool
                  </button>
                  {picker && (
                    <ToolPicker
                      uploads={props.uploads}
                      onUploaded={props.onUploaded}
                      onError={props.onError}
                      onPick={async (upload) => {
                        setPicker(false);
                        const mesh = await props.ensureToolMesh(upload.file, upload.name);
                        if (!mesh) return;
                        const fill = fills[fillIndex[0]];
                        const rect = {
                          x0: one.x0 * W,
                          y0: one.y0 * D,
                          x1: one.x1 * W,
                          y1: one.y1 * D,
                        };
                        const placed = I.autoPlace(
                          upload.file,
                          mesh,
                          rect,
                          Math.min(fill.height, maxFill),
                        );
                        commit({ tools: [...tools, placed] }, true);
                        props.onSelectAfterCommit({ kind: "tool", index: tools.length });
                      }}
                    />
                  )}
                </span>
              )}
              <button
                type="button"
                title="Remove the fill (tools inside it stay, but cut nothing)"
                onClick={() =>
                  commit({ fills: fills.filter((_, i) => !fillIndex.includes(i)) }, true)
                }
              >
                Unfill
              </button>
            </>
          )}
        </>
      );
    }
  } else if (selection?.kind === "wall") {
    const splits = selection.axis === "x" ? layout.cols : layout.rows;
    const size = selection.axis === "x" ? W : D;
    const pos = splits[selection.line - 1];
    if (pos !== undefined) {
      body = (
        <>
          <NumberField
            key={`${selection.axis}${selection.line}${pos}`}
            value={pos * size}
            step={0.5}
            suffix={selection.axis === "x" ? "mm from left" : "mm from hinge"}
            onSubmit={(mm) =>
              commit(
                { layout: L.moveLine(layout, selection.axis, selection.line, mm / size, 5 / size) },
                true,
              )
            }
          />
          <button
            type="button"
            onClick={() => commit({ layout: L.merge(layout, [selection.a, selection.b]) })}
            title="Delete"
          >
            Remove wall
          </button>
          <button
            type="button"
            onClick={() => commit({ layout: L.removeLine(layout, selection.axis, selection.line) })}
          >
            Remove line
          </button>
        </>
      );
    }
  } else if (selection?.kind === "tool") {
    const t = tools[selection.index];
    const mesh = t && toolMeshes.get(t.file);
    if (t) {
      const update = (patch: Partial<I.Tool>) => {
        const next = [...tools];
        next[selection.index] = { ...t, ...patch };
        commit({ tools: next }, true);
      };
      const layIndex = I.LAYS.findIndex(([rx, ry]) => rx === t.rx && ry === t.ry);
      body = (
        <>
          <span className="vp-sel" title={t.file}>
            {mesh?.name ?? "tool"}
          </span>
          <NumberField
            key={`d${selection.index}${t.depth}`}
            value={t.depth}
            min={0}
            step={0.5}
            suffix="mm deep"
            onSubmit={(v) => update({ depth: Math.max(0, v) })}
          />
          <NumberField
            key={`c${selection.index}${t.clearance}`}
            value={t.clearance}
            min={0}
            step={0.1}
            suffix="mm gap"
            onSubmit={(v) => update({ clearance: Math.max(0, v) })}
          />
          <select
            value={t.style}
            onChange={(e) => update({ style: e.target.value as I.PocketStyle })}
            title="Pocket shape"
          >
            <option value="silhouette">straight pocket</option>
            <option value="exact">form fit</option>
          </select>
          <button
            type="button"
            title="Turn 90° (drag the round knob past the tip for any angle, [ ] for 15°)"
            onClick={() => update({ rz: ((t.rz + 90 + 180) % 360) - 180 })}
          >
            ↻ 90°
          </button>
          <button
            type="button"
            title="Rest the tool on a different side"
            disabled={!mesh}
            onClick={() => {
              if (!mesh) return;
              const [rx, ry] = I.LAYS[(layIndex + 1) % I.LAYS.length];
              update(I.relay(t, mesh, rx, ry));
            }}
          >
            ⤾ Lay
          </button>
          <button
            type="button"
            title="Duplicate"
            onClick={() => {
              commit({ tools: [...tools, { ...t, x: t.x + 5, y: t.y + 5 }] }, true);
              props.onSelectAfterCommit({ kind: "tool", index: tools.length });
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="danger"
            title="Remove (Delete)"
            onClick={() => commit({ tools: tools.filter((_, i) => i !== selection.index) })}
          >
            Remove
          </button>
        </>
      );
    }
  }

  return (
    <div
      ref={ref}
      className="vp-actions"
      style={{ display: body ? undefined : "none" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {body}
      {body && (
        <button type="button" className="vp-close" onClick={() => onSelection(null)} title="Esc">
          ✕
        </button>
      )}
    </div>
  );
});

function ToolPicker({
  uploads,
  onUploaded,
  onPick,
  onError,
}: {
  uploads: api.Upload[];
  onUploaded: () => void;
  onPick: (upload: api.Upload) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="vp-picker">
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Uploading…" : "Upload STL / 3MF…"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".stl,.3mf,model/stl,model/3mf"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const upload = await api.uploadTool(file);
            onUploaded();
            onPick(upload);
          } catch (err) {
            onError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      {uploads.length > 0 && <div className="vp-picker-head">Previously uploaded</div>}
      <div className="vp-picker-list">
        {uploads.map((u) => (
          <button
            key={u.file}
            type="button"
            onClick={() => onPick(u)}
            title={`${u.triangles.toLocaleString()} triangles`}
          >
            <span>{u.name}</span>
            <small>
              {fmt(u.bbox[3] - u.bbox[0])} × {fmt(u.bbox[4] - u.bbox[1])} ×{" "}
              {fmt(u.bbox[5] - u.bbox[2])} mm
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`vp-tool ${on ? "on" : ""}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="vp-stepper" title={`Even grid ${label} (resets combined compartments)`}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1}>
        −
      </button>
      <span>
        {value} {label}
      </span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 12}>
        +
      </button>
    </span>
  );
}

function NumberField({
  value,
  suffix,
  onSubmit,
  min,
  max,
  step = 0.5,
}: {
  value: number;
  suffix: string;
  onSubmit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [text, setText] = useState(fmt(value));
  const submit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && Math.abs(n - value) > 0.001) onSubmit(n);
  };
  return (
    <label className="vp-position">
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
      />
      {suffix}
    </label>
  );
}
