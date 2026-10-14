import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import * as api from "./api";
import { Panel } from "./components/Panel";
import { PresetManager } from "./components/PresetManager";
import { StatusBar } from "./components/StatusBar";
import { CompartmentsSection, ViewportEditor } from "./components/ViewportEditor";
import { fillsFromParams, supportsInserts, type ToolMesh } from "./layout/inserts";
import * as L from "./layout/model";
import type { EditPatch } from "./layout/useLayoutHistory";
import { useLayoutHistory } from "./layout/useLayoutHistory";
import { decodeMesh, decodeToolMesh, initMesh } from "./mesh";
import type { Params, Preset, RenderStats, Schema } from "./types";
import { useParamHistory } from "./useParamHistory";
import {
  type LayoutFrame,
  LayoutTool,
  parseLayoutFrame,
  type ToolMode,
  type ToolSelection,
} from "./viewer/LayoutTool";
import { defaultViewOptions, Viewer, type ViewOptions } from "./viewer/Viewer";

/** Input quieter than this counts as settled. */
const SETTLE_MS = 250;
/** $fn used for intermediate renders during a burst of changes. */
const DRAFT_FN = 16;

/** Only non-default parameters travel in the URL, so links stay short. */
function readUrlParams(): Params {
  try {
    const raw = new URLSearchParams(location.search).get("p") ?? location.hash.slice(1);
    if (!raw) return {};
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return {};
  }
}

/** Download name that says what's in the file, e.g. `clamshell-80x80x25mm-9comp-inserts`. */
function exportStem(schema: Schema, params: Params): string {
  const parts = [schema.file.replace(/\.scad$/i, "")];
  const { width, depth, height, cells, fills } = params;
  const mm = (v: unknown) => String(Math.round(Number(v) * 10) / 10);
  if ([width, depth, height].every((v) => typeof v === "number")) {
    parts.push(`${mm(width)}x${mm(depth)}x${mm(height)}mm`);
  }
  if (Array.isArray(cells) && cells.length) parts.push(`${new Set(cells).size}comp`);
  if (Array.isArray(fills) && fills.length) parts.push("inserts");
  return parts.join("-").replace(/[^\w.-]+/g, "_");
}

function defaultsOf(schema: Schema): Params {
  return Object.fromEntries(schema.params.map((p) => [p.name, p.default]));
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [gpu, setGpu] = useState<string>();
  const firstRender = useRef(true);

  const [schema, setSchema] = useState<Schema | null>(null);
  const [params, setParams] = useState<Params>({});
  const [quality] = useState(32);
  const [options, setOptions] = useState<ViewOptions>(defaultViewOptions);
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(() =>
    localStorage.getItem("mv.activePreset"),
  );
  const [exporting, setExporting] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState(0);
  const [frame, setFrame] = useState<LayoutFrame | null>(null);
  const [renderedParams, setRenderedParams] = useState<Params | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [snap, setSnap] = useState(1);
  const [selection, setSelection] = useState<ToolSelection>(null);
  const toolRef = useRef<LayoutTool | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  // The tool is created once; route its events through refs to the latest handlers.
  const toolEvents = useRef({
    commit: (_patch: EditPatch, _keep?: boolean) => {},
    select: (_sel: ToolSelection) => {},
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const viewer = new Viewer(canvasRef.current);
    viewerRef.current = viewer;
    void viewer.initialized.then(() => setGpu(viewer.backend));
    const tool = new LayoutTool(viewer, {
      commit: (next, keep) => toolEvents.current.commit(next, keep),
      select: (sel) => toolEvents.current.select(sel),
      anchor: (point) => {
        const el = actionRef.current;
        if (!el) return;
        if (!point) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "";
        // Keep the bar inside the viewport.
        const wrap = el.parentElement!.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = point.x - w / 2;
        let top = point.y - h - 14;
        if (top < 8) top = point.y + 14;
        left = Math.min(Math.max(8, left), wrap.width - w - 8);
        top = Math.min(Math.max(8, top), wrap.height - h - 60);
        el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      },
    });
    toolRef.current = tool;
    // Handy for debugging and browser tests: model-space point -> canvas pixels.
    (window as unknown as { __mvProject?: unknown }).__mvProject = (
      x: number,
      y: number,
      z: number,
    ) => viewer.project(new THREE.Vector3(x, y, z));
    return () => {
      tool.dispose();
      toolRef.current = null;
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initMesh();
        const [loaded, loadedPresets] = await Promise.all([api.fetchSchema(), api.listPresets()]);
        if (cancelled) return;
        setSchema(loaded);
        setParams({ ...defaultsOf(loaded), ...readUrlParams() });
        setPresets(loadedPresets);
      } catch (e) {
        if (!cancelled) setFatal(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pick up edits made to the .scad file while the page is open, keeping any
  // values the user has already dialled in.
  useEffect(() => {
    return api.watchSource(async () => {
      try {
        const next = await api.fetchSchema();
        setSchema(next);
        paramHistory.setSilently((prev) => {
          const merged = defaultsOf(next);
          for (const key of Object.keys(merged)) {
            if (key in prev) merged[key] = prev[key];
          }
          return merged;
        });
        setReloaded((n) => n + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, []);

  // Latest-wins render queue. Renders take well under 100 ms, so rather than
  // debouncing and aborting (which would starve continuous slider drags), keep
  // at most one request in flight and, when it lands, immediately render the
  // newest parameters if they changed meanwhile.
  const latest = useRef({ params, quality, reloaded });
  latest.current = { params, quality, reloaded };
  // While values are changing rapidly (slider drags), render with fewer facets
  // and follow up at full quality once input settles.
  const lastChange = useRef(-Infinity);
  const inBurst = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const pumping = useRef(false);
  const lastRequested = useRef("");

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    setBusy(true);
    setElapsed(0);
    const started = performance.now();
    const ticker = window.setInterval(() => setElapsed(performance.now() - started), 100);
    try {
      for (;;) {
        const { params: requested, quality: fullQuality, reloaded: r } = latest.current;
        const rapid = inBurst.current && performance.now() - lastChange.current < SETTLE_MS;
        const q = rapid ? Math.min(DRAFT_FN, fullQuality) : fullQuality;
        const key = JSON.stringify([requested, q, r]);
        if (key === lastRequested.current) break;
        lastRequested.current = key;
        try {
          const result = await api.renderModel(requested, q);
          const { data, decodeMs } = await decodeMesh(result.buffer);
          const shownAt = performance.now();
          const viewer = viewerRef.current;
          if (viewer) {
            viewer.setMesh(data);
            if (firstRender.current) {
              viewer.fit("iso");
              firstRender.current = false;
            }
          }
          const displayMs = performance.now() - shownAt;
          const bbox = data.bbox;
          setError(null);
          setFrame(parseLayoutFrame(result.log));
          setRenderedParams(requested);
          setStats({
            renderMs: result.renderMs,
            triangles: result.triangles,
            vertices: result.vertices,
            cached: result.cached,
            parts: result.parts,
            log: result.log,
            volume: data.volume,
            area: data.surface_area,
            size: [bbox[3] - bbox[0], bbox[4] - bbox[1], bbox[5] - bbox[2]],
            decodeMs,
            displayMs,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      window.clearInterval(ticker);
      pumping.current = false;
      setBusy(false);
    }
  }, []);

  // Layout effect + microtask: the request leaves before the browser even paints
  // the input change. Bursts need no timer — the queue above already collapses
  // everything that arrives while a request is in flight into one follow-up.
  useLayoutEffect(() => {
    if (!schema || Object.keys(params).length === 0) return;
    const now = performance.now();
    // Only a change hot on the heels of another counts as rapid; a single edit
    // renders at full quality straight away.
    inBurst.current = now - lastChange.current < SETTLE_MS;
    lastChange.current = now;
    queueMicrotask(() => void pump());
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => void pump(), SETTLE_MS + 20);
  }, [params, quality, schema, reloaded, pump]);

  useEffect(() => {
    viewerRef.current?.setOptions(options);
  }, [options]);

  // Keep the URL in sync so the current configuration can be shared or reloaded.
  useEffect(() => {
    if (!schema) return;
    const defaults = defaultsOf(schema);
    const changed = Object.fromEntries(
      Object.entries(params).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults[k])),
    );
    const hash = Object.keys(changed).length
      ? `#${encodeURIComponent(JSON.stringify(changed))}`
      : "";
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }, [params, schema]);

  const patch = useCallback((values: Params) => {
    setParams((prev) => ({ ...prev, ...values }));
  }, []);

  const hasLayout = useMemo(
    () => (schema ? L.supportsLayout(schema.params.map((p) => p.name)) : false),
    [schema],
  );
  const hasInserts = useMemo(
    () => (schema ? supportsInserts(schema.params.map((p) => p.name)) : false),
    [schema],
  );
  const layoutHistory = useLayoutHistory(params, patch, hasInserts);
  const paramHistory = useParamHistory(params, setParams);
  const renderedLayout = useMemo(
    () => (renderedParams ? L.fromParams(renderedParams) : null),
    [renderedParams],
  );
  const renderedFills = useMemo(
    () => (renderedParams ? fillsFromParams(renderedParams) : null),
    [renderedParams],
  );

  // Tool meshes for the ghosts, fetched once per uploaded file.
  const [toolMeshes, setToolMeshes] = useState<Map<string, ToolMesh>>(new Map());
  const [uploads, setUploads] = useState<api.Upload[]>([]);
  const loadingMeshes = useRef(new Set<string>());
  const refreshUploads = useCallback(async () => {
    try {
      setUploads(await api.listUploads());
    } catch {
      /* the list is a convenience; ignore failures */
    }
  }, []);
  useEffect(() => {
    if (hasInserts) void refreshUploads();
  }, [hasInserts, refreshUploads]);
  const ensureToolMesh = useCallback(
    async (file: string, name?: string): Promise<ToolMesh | null> => {
      const existing = toolMeshes.get(file);
      if (existing) return existing;
      if (loadingMeshes.current.has(file)) return null;
      loadingMeshes.current.add(file);
      try {
        const label =
          name ?? uploads.find((u) => u.file === file)?.name ?? file.split("/").pop() ?? file;
        const mesh = await decodeToolMesh(await api.fetchUpload(file), label);
        setToolMeshes((prev) => new Map(prev).set(file, mesh));
        return mesh;
      } catch (e) {
        setError(`Could not load tool ${file}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        loadingMeshes.current.delete(file);
      }
    },
    [toolMeshes, uploads],
  );
  useEffect(() => {
    for (const t of layoutHistory.tools) if (!toolMeshes.has(t.file)) void ensureToolMesh(t.file);
  }, [layoutHistory.tools, toolMeshes, ensureToolMesh]);
  const lidDividers = typeof params.lid_dividers === "boolean" ? params.lid_dividers : undefined;
  const editActive = hasLayout;

  toolEvents.current.commit = (next, keep) => {
    if (layoutHistory.commit(next) && !keep) setSelection(null);
  };
  const selectAfterCommit = useCallback((sel: ToolSelection) => setSelection(sel), []);
  toolEvents.current.select = setSelection;

  useEffect(() => {
    toolRef.current?.setEnabled(editActive);
  }, [editActive]);

  useEffect(() => {
    toolRef.current?.setFrame(frame);
  }, [frame]);

  useEffect(() => {
    toolRef.current?.setState({
      layout: layoutHistory.layout,
      rendered: renderedLayout,
      lidDividers: lidDividers ?? true,
      mode: toolMode,
      snap,
      selection,
      fills: layoutHistory.fills,
      tools: layoutHistory.tools,
      renderedFills,
      toolMeshes,
    });
  }, [
    layoutHistory.layout,
    layoutHistory.fills,
    layoutHistory.tools,
    renderedLayout,
    renderedFills,
    toolMeshes,
    lidDividers,
    toolMode,
    snap,
    selection,
  ]);

  // Selections refer to compartment ids, which renumber when the layout changes.
  useEffect(() => {
    setSelection((sel) => {
      if (!sel) return sel;
      const regions = L.regions(layoutHistory.layout);
      if (sel.kind === "regions") {
        const ids = sel.ids.filter((id) => regions.some((r) => r.id === id));
        return ids.length === sel.ids.length ? sel : ids.length ? { ...sel, ids } : null;
      }
      if (sel.kind === "tool") return sel.index < layoutHistory.tools.length ? sel : null;
      const splits = sel.axis === "x" ? layoutHistory.layout.cols : layoutHistory.layout.rows;
      return sel.line <= splits.length ? sel : null;
    });
  }, [layoutHistory.layout, layoutHistory.tools]);

  useEffect(() => {
    if (editActive) setOptions((o) => (o.explode ? { ...o, explode: 0 } : o));
  }, [editActive, options.explode]);

  const focusBase = useCallback(() => {
    const bounds = toolRef.current?.baseBounds();
    if (bounds) viewerRef.current?.focusBox(bounds[0], bounds[1]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      // Text boxes keep their own undo; sliders, checkboxes and dropdowns don't have one.
      const typing =
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        (target instanceof HTMLInputElement && ["text", "search"].includes(target.type));
      if (
        mod &&
        !e.altKey &&
        !typing &&
        (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        (target as HTMLElement | null)?.blur?.();
        if (e.key.toLowerCase() === "y" || e.shiftKey) paramHistory.redo();
        else paramHistory.undo();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (editActive) {
        const layout = layoutHistory.layout;
        if (mod && e.key.toLowerCase() === "a") {
          e.preventDefault();
          setSelection({ kind: "regions", ids: L.regions(layout).map((r) => r.id) });
          return;
        }
        if (!mod) {
          const key = e.key.toLowerCase();
          if (key === "escape") {
            setSelection(null);
            setToolMode("select");
            return;
          }
          if (key === "s") return setToolMode("select");
          if (key === "v") return setToolMode("split-x");
          if (key === "h") return setToolMode("split-y");
          if (key === "f") return focusBase();
          if ((key === "delete" || key === "backspace") && selection?.kind === "wall") {
            toolEvents.current.commit({ layout: L.merge(layout, [selection.a, selection.b]) });
            return;
          }
          if ((key === "delete" || key === "backspace") && selection?.kind === "tool") {
            toolEvents.current.commit({
              tools: layoutHistory.tools.filter((_, i) => i !== selection.index),
            });
            return;
          }
          if ((key === "[" || key === "]") && selection?.kind === "tool") {
            const tools = [...layoutHistory.tools];
            const t = tools[selection.index];
            tools[selection.index] = {
              ...t,
              rz: ((((t.rz + (key === "]" ? 15 : -15) + 180) % 360) + 360) % 360) - 180,
            };
            toolEvents.current.commit({ tools }, true);
            return;
          }
          if (key === "m" && selection?.kind === "regions" && selection.ids.length > 1) {
            toolEvents.current.commit({ layout: L.merge(layout, selection.ids) });
            return;
          }
          if (key === "u" && selection?.kind === "regions") {
            toolEvents.current.commit({ layout: L.unmerge(layout, selection.ids) });
            return;
          }
        }
      }
      if (e.key === "r") viewerRef.current?.fit("iso");
      if (e.key === "w") setOptions((o) => ({ ...o, wireframe: !o.wireframe }));
      if (e.key === "e") setOptions((o) => ({ ...o, edges: !o.edges }));
      if (e.key === "g") setOptions((o) => ({ ...o, grid: !o.grid }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editActive, layoutHistory, paramHistory, selection, focusBase]);

  const resetAll = useCallback(() => {
    if (schema) setParams(defaultsOf(schema));
  }, [schema]);

  const onExport = useCallback(
    async (format: string) => {
      setExporting(format);
      try {
        // Exports always use the finest setting the user picked, never draft.
        // The source is the same whatever the settings, so it keeps its own name.
        const stem = schema && format !== "scad" ? exportStem(schema, params) : undefined;
        if (format === "png") {
          // Rendered from the live view on the GPU (OpenSCAD's PNG export needs OpenGL).
          const viewer = viewerRef.current;
          if (!viewer) throw new Error("the 3D view is not ready");
          const blob = await (await fetch(viewer.snapshot())).blob();
          api.downloadBlob(blob, `${stem ?? "clamshell"}.png`);
        } else {
          await api.exportModel(params, Math.max(quality, 64), format, stem);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(null);
      }
    },
    [params, quality, schema],
  );

  useEffect(() => {
    if (activePreset) localStorage.setItem("mv.activePreset", activePreset);
    else localStorage.removeItem("mv.activePreset");
  }, [activePreset]);

  return (
    <div className="app">
      {schema && (
        <Panel
          schema={schema}
          params={params}
          onChange={patch}
          onResetAll={resetAll}
          onUndo={paramHistory.undo}
          onRedo={paramHistory.redo}
          canUndo={paramHistory.canUndo}
          canRedo={paramHistory.canRedo}
          hideLayoutParams={hasLayout}
          onExport={onExport}
          exporting={exporting}
          compartments={
            hasLayout && (
              <CompartmentsSection
                layout={layoutHistory.layout}
                frame={frame}
                mode={toolMode}
                onMode={setToolMode}
                snap={snap}
                onSnap={setSnap}
                lidDividers={lidDividers}
                onLidDividers={(on) => patch({ lid_dividers: on })}
                commit={(next, keep) => toolEvents.current.commit(next, keep)}
                onFocus={focusBase}
              />
            )
          }
          presets={
            <PresetManager
              schema={schema}
              params={params}
              presets={presets}
              onPresets={setPresets}
              onApply={(next) => {
                setParams(next);
                setSelection(null);
              }}
              activeName={activePreset}
              onActiveName={setActivePreset}
            />
          }
        />
      )}

      <main className="stage">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} />
          {hasLayout && (
            <ViewportEditor
              actionRef={actionRef}
              ready={Boolean(frame)}
              layout={layoutHistory.layout}
              fills={layoutHistory.fills}
              tools={layoutHistory.tools}
              toolMeshes={toolMeshes}
              insertsEnabled={hasInserts}
              uploads={uploads}
              onUploaded={refreshUploads}
              ensureToolMesh={ensureToolMesh}
              onSelectAfterCommit={selectAfterCommit}
              onError={setError}
              frame={frame}
              mode={toolMode}
              snap={snap}
              selection={selection}
              onSelection={setSelection}
              commit={(next, keep) => toolEvents.current.commit(next, keep)}
            />
          )}
          {/* Most renders finish in well under 150 ms; only show progress when one doesn't. */}
          {busy && elapsed > 150 && !fatal && (
            <div className="render-badge">
              <div className="spinner small" />
              rendering…
            </div>
          )}
          {fatal && (
            <div className="overlay fatal">
              <div>
                <h2>The configurator couldn't start</h2>
                <p>{fatal}</p>
                <p className="hint">
                  It needs a recent browser with WebAssembly. Try reloading, or a current Chrome,
                  Edge, Firefox or Safari.
                </p>
              </div>
            </div>
          )}
        </div>
        <StatusBar stats={stats} busy={busy} elapsed={elapsed} error={error} gpu={gpu} />
      </main>
    </div>
  );
}
