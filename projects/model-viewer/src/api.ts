// The viewer's "backend", running entirely in the browser. It used to be an
// axum server shelling out to OpenSCAD; now OpenSCAD runs as WebAssembly in a
// worker pool (see engine/pool.ts), presets and uploaded tools live in
// IndexedDB, and renders are cached in memory and in IndexedDB.
//
// Function names and shapes match the old HTTP client so the UI is unchanged.
import builtinPresetFile from "../model/clamshell.presets.json";
import bundledSource from "../model/clamshell.scad?raw";
import {
  export_args,
  hash_hex,
  inspect_upload,
  merge_parts,
  parse_schema,
  part_mesh,
  plan_render,
} from "../wasm/pkg/model_viewer.js";
import { idb, safely } from "./engine/idb";
import { runOpenSCAD } from "./engine/pool";
import { initMesh } from "./mesh";
import type { Params, Preset, Schema } from "./types";

const MODEL_FILE = "clamshell.scad";
const OPENSCAD_VERSION = "OpenSCAD 2026.10.11 (WebAssembly)";
const VIEW_CACHE_ENTRIES = 128;
const PART_CACHE_ENTRIES = 512;
const STORED_PARTS = 400;

let source = bundledSource;

// ---------------------------------------------------------------- schema

export async function fetchSchema(): Promise<Schema> {
  await initMesh();
  return {
    ...JSON.parse(parse_schema(source)),
    file: MODEL_FILE,
    source_hash: hash_hex(new TextEncoder().encode(source)),
    openscad_version: OPENSCAD_VERSION,
  };
}

export async function fetchSource(): Promise<string> {
  return source;
}

// ---------------------------------------------------------------- render

export interface RenderResult {
  buffer: ArrayBuffer;
  renderMs: number;
  triangles: number;
  vertices: number;
  cached: boolean;
  parts: Record<string, number | "cached">;
  log: string;
}

interface Plan {
  view_key: string;
  jobs: { part: string; key: string; args: string[] }[];
  uploads: string[];
}

interface PartResult {
  mvm: Uint8Array;
  log: string[];
  ms: number;
}

/** Least-recently-used map. */
class Lru<V> {
  private map = new Map<string, V>();
  constructor(private limit: number) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }
  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string);
  }
}

const viewCache = new Lru<RenderResult>(VIEW_CACHE_ENTRIES);
const partCache = new Lru<PartResult>(PART_CACHE_ENTRIES);
const inflight = new Map<string, Promise<PartResult>>();

function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === "AbortError";
}

/** OpenSCAD's exit status plus the log lines that explain a failure. */
function renderFailure(code: number, log: string[], error?: string): Error {
  if (error) return new Error(error);
  const detail = log
    .filter((l) => l.includes("ERROR") || l.includes("WARNING"))
    .slice(0, 12)
    .join("\n");
  return new Error(`OpenSCAD exited with ${code}${detail ? `:\n${detail}` : ""}`);
}

async function storePart(key: string, part: PartResult) {
  await safely(async () => {
    await idb.put("parts", key, part);
    const index = (await idb.get<Record<string, number>>("kv", "parts.index")) ?? {};
    index[key] = Date.now();
    const keys = Object.keys(index);
    if (keys.length > STORED_PARTS) {
      // Drop the oldest quarter in one go.
      const stale = keys
        .sort((a, b) => index[a] - index[b])
        .slice(0, keys.length - STORED_PARTS * 0.75);
      for (const k of stale) {
        delete index[k];
        await idb.delete("parts", k);
      }
    }
    await idb.put("kv", "parts.index", index);
  }, undefined);
}

async function renderPart(
  job: Plan["jobs"][number],
  files: [string, Uint8Array][],
  signal?: AbortSignal,
): Promise<PartResult & { cached: boolean }> {
  const hit =
    partCache.get(job.key) ??
    (await safely(() => idb.get<PartResult>("parts", job.key), undefined));
  if (hit) {
    partCache.set(job.key, hit);
    return { ...hit, cached: true };
  }

  let pending = inflight.get(job.key);
  if (!pending) {
    pending = (async () => {
      const run = await runOpenSCAD(
        { source, args: job.args, files, format: "3mf", extension: "3mf" },
        signal,
      );
      // A part can legitimately be empty (e.g. a box with no dividers).
      const empty = run.code !== 0 && run.log.some((l) => l.includes("top level object is empty"));
      if (run.error || (run.code !== 0 && !empty))
        throw renderFailure(run.code, run.log, run.error);
      const part = {
        mvm: part_mesh(empty ? new Uint8Array() : (run.bytes ?? new Uint8Array())),
        log: run.log,
        ms: run.ms,
      };
      partCache.set(job.key, part);
      void storePart(job.key, part);
      return part;
    })().finally(() => inflight.delete(job.key));
    inflight.set(job.key, pending);
  }

  try {
    return { ...(await pending), cached: false };
  } catch (e) {
    // Someone else's superseded request was carrying this part; take it over.
    if (isAbort(e) && !signal?.aborted) return renderPart(job, files, signal);
    throw e;
  }
}

export async function renderModel(
  params: Params,
  quality: number,
  signal?: AbortSignal,
): Promise<RenderResult> {
  await initMesh();
  const started = performance.now();
  const plan: Plan = JSON.parse(plan_render(source, JSON.stringify(params), quality));

  const hit = viewCache.get(plan.view_key);
  if (hit) return { ...hit, cached: true };

  const files = await uploadFiles(plan.uploads);
  const parts = await Promise.all(plan.jobs.map((job) => renderPart(job, files, signal)));
  if (signal?.aborted) throw new DOMException("render superseded", "AbortError");

  const mvm = merge_parts(parts.map((p) => p.mvm));
  const header = new DataView(mvm.buffer, mvm.byteOffset);
  const seen = new Set<string>();
  const log: string[] = [];
  for (const part of parts) {
    for (const line of part.log) {
      // Top-level echoes repeat in every part; keep one copy.
      if (!line.startsWith("ECHO:") || !seen.has(line)) {
        seen.add(line);
        log.push(line);
      }
    }
  }

  const result: RenderResult = {
    buffer: mvm.slice().buffer,
    renderMs: Math.round(performance.now() - started),
    vertices: header.getUint32(8, true),
    triangles: header.getUint32(12, true),
    cached: false,
    parts: Object.fromEntries(
      plan.jobs.map((job, i) => [job.part, parts[i].cached ? "cached" : Math.round(parts[i].ms)]),
    ),
    log: log.join("\n"),
  };
  viewCache.set(plan.view_key, result);
  return result;
}

// ---------------------------------------------------------------- export

const EXPORT_FORMATS: Record<string, { flag: string; ext: string; mime: string }> = {
  "3mf": { flag: "3mf", ext: "3mf", mime: "model/3mf" },
  stl: { flag: "binstl", ext: "stl", mime: "model/stl" },
  off: { flag: "off", ext: "off", mime: "application/octet-stream" },
  amf: { flag: "amf", ext: "amf", mime: "application/octet-stream" },
  obj: { flag: "obj", ext: "obj", mime: "application/octet-stream" },
  csg: { flag: "csg", ext: "csg", mime: "text/plain" },
};

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `stem` names the file; the extension comes from the format. PNG is handled by the viewer. */
export async function exportModel(
  params: Params,
  quality: number,
  format: string,
  stem?: string,
): Promise<void> {
  const fmt = format.toLowerCase();
  if (fmt === "json") {
    const set = { parameterSets: { web: params }, fileFormatVersion: "1" };
    downloadBlob(
      new Blob([JSON.stringify(set, null, 2)], { type: "application/json" }),
      `${stem ?? "parameters"}.json`,
    );
    return;
  }
  if (fmt === "scad") {
    downloadBlob(new Blob([source], { type: "text/plain" }), MODEL_FILE);
    return;
  }
  const spec = EXPORT_FORMATS[fmt];
  if (!spec) throw new Error(`unsupported format '${format}'`);

  await initMesh();
  const args = export_args(JSON.stringify(params), quality);
  const plan: Plan = JSON.parse(plan_render(source, JSON.stringify(params), quality));
  const files = await uploadFiles(plan.uploads);
  const run = await runOpenSCAD({ source, args, files, format: spec.flag, extension: spec.ext });
  if (run.error || run.code !== 0 || !run.bytes) throw renderFailure(run.code, run.log, run.error);
  const bytes = run.bytes.slice();
  downloadBlob(new Blob([bytes.buffer], { type: spec.mime }), `${stem ?? "clamshell"}.${spec.ext}`);
}

// ---------------------------------------------------------------- uploads

export interface Upload {
  file: string;
  name: string;
  triangles: number;
  bbox: number[];
  bytes: number;
  uploaded: number;
}

interface StoredUpload {
  record: Upload;
  data: Uint8Array;
}

export async function listUploads(): Promise<Upload[]> {
  const all = await safely(() => idb.all<StoredUpload>("uploads"), []);
  return all.map((u) => u.record).sort((a, b) => b.uploaded - a.uploaded);
}

export async function uploadTool(file: File): Promise<Upload> {
  await initMesh();
  const data = new Uint8Array(await file.arrayBuffer());
  if (data.length === 0) throw new Error("empty upload");
  let info: { hash: string; ext: string; triangles: number; bbox: number[] };
  try {
    info = JSON.parse(inspect_upload(data));
  } catch (e) {
    throw new Error(`${file.name} is ${e instanceof Error ? e.message : String(e)}`);
  }
  const path = `uploads/${info.hash}.${info.ext}`;
  const existing = await safely(() => idb.get<StoredUpload>("uploads", path), undefined);
  if (existing) return existing.record;
  const record: Upload = {
    file: path,
    name: file.name,
    triangles: info.triangles,
    bbox: info.bbox,
    bytes: data.length,
    uploaded: Math.floor(Date.now() / 1000),
  };
  memoryUploads.set(path, data);
  await safely(() => idb.put("uploads", path, { record, data } satisfies StoredUpload), undefined);
  return record;
}

/** Uploads made while IndexedDB is unavailable still work for this page session. */
const memoryUploads = new Map<string, Uint8Array>();

async function uploadData(path: string): Promise<Uint8Array> {
  const data =
    memoryUploads.get(path) ??
    (await safely(() => idb.get<StoredUpload>("uploads", path), undefined))?.data;
  if (!data)
    throw new Error(`${path} isn't in this browser's uploads. Upload the tool file again.`);
  return data;
}

export async function fetchUpload(path: string): Promise<ArrayBuffer> {
  return (await uploadData(path)).slice().buffer;
}

function uploadFiles(paths: string[]): Promise<[string, Uint8Array][]> {
  return Promise.all(paths.map(async (p) => [p, await uploadData(p)] as [string, Uint8Array]));
}

// ---------------------------------------------------------------- presets

const builtinPresets: Preset[] = (builtinPresetFile as Preset[]).map((p) => ({
  ...p,
  builtin: true,
  updated: undefined,
}));

const userPresets = async () =>
  (await safely(() => idb.get<Preset[]>("kv", "presets"), undefined)) ?? [];
const hiddenNames = async () =>
  (await safely(() => idb.get<string[]>("kv", "presets.hidden"), undefined)) ?? [];
const writePresets = (presets: Preset[]) => idb.put("kv", "presets", presets);
const writeHidden = (names: string[]) => idb.put("kv", "presets.hidden", names);

async function allPresets(): Promise<Preset[]> {
  const hidden = new Set(await hiddenNames());
  return [...builtinPresets, ...(await userPresets()).map((p) => ({ ...p, builtin: false }))].map(
    (p) => ({
      ...p,
      hidden: hidden.has(p.name),
    }),
  );
}

const nowSecs = () => Math.floor(Date.now() / 1000);

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("preset name must not be empty");
  if ([...trimmed].length > 80) throw new Error("preset name is too long (80 characters max)");
  return trimmed;
}

export class PresetConflict extends Error {}

export function listPresets(): Promise<Preset[]> {
  return allPresets();
}

export async function savePreset(
  preset: { name: string; params: Params; description?: string },
  overwrite = false,
): Promise<Preset[]> {
  const name = cleanName(preset.name);
  if (builtinPresets.some((p) => p.name === name)) {
    const message = `“${name}” is a built-in preset; save under another name`;
    throw overwrite ? new Error(message) : new PresetConflict(message);
  }
  const presets = await userPresets();
  const next: Preset = {
    name,
    params: preset.params,
    description: preset.description?.trim() || undefined,
    updated: nowSecs(),
  };
  const at = presets.findIndex((p) => p.name === name);
  if (at >= 0 && !overwrite) throw new PresetConflict(`a preset named “${name}” already exists`);
  if (at >= 0) presets[at] = next;
  else presets.push(next);
  await writePresets(presets);
  return allPresets();
}

export async function renamePreset(name: string, newName: string): Promise<Preset[]> {
  const renamed = cleanName(newName);
  if (builtinPresets.some((p) => p.name === name))
    throw new Error("built-in presets cannot be renamed");
  if (renamed !== name && (await allPresets()).some((p) => p.name === renamed)) {
    throw new Error(`a preset named “${renamed}” already exists`);
  }
  const presets = await userPresets();
  const preset = presets.find((p) => p.name === name);
  if (!preset) throw new Error(`no preset named “${name}”`);
  preset.name = renamed;
  preset.updated = nowSecs();
  await writePresets(presets);
  const hidden = await hiddenNames();
  if (hidden.includes(name)) await writeHidden([...hidden.filter((n) => n !== name), renamed]);
  return allPresets();
}

export async function setPresetVisibility(names: string[], hidden: boolean): Promise<Preset[]> {
  const current = (await hiddenNames()).filter((n) => !names.includes(n));
  await writeHidden(hidden ? [...current, ...names] : current);
  return allPresets();
}

export async function deletePreset(name: string): Promise<Preset[]> {
  if (builtinPresets.some((p) => p.name === name))
    throw new Error("built-in presets cannot be deleted");
  const presets = await userPresets();
  const kept = presets.filter((p) => p.name !== name);
  if (kept.length === presets.length) throw new Error(`no preset named “${name}”`);
  await writePresets(kept);
  const hidden = await hiddenNames();
  if (hidden.includes(name)) await writeHidden(hidden.filter((n) => n !== name));
  return allPresets();
}

/** Adds presets from an exported file; clashing names get a numeric suffix. */
export async function importPresets(
  incoming: { name: string; params: Params; description?: string }[],
): Promise<Preset[]> {
  const presets = await userPresets();
  const taken = (await allPresets()).map((p) => p.name);
  for (const preset of incoming) {
    const base = cleanName(preset.name);
    let name = base;
    for (let n = 2; taken.includes(name); n++) name = `${base} (${n})`;
    taken.push(name);
    presets.push({ ...preset, name, builtin: false, updated: nowSecs() });
  }
  await writePresets(presets);
  return allPresets();
}

// ---------------------------------------------------------------- live reload

const sourceListeners = new Set<(hash: string) => void>();

// In dev, editing model/clamshell.scad hot-swaps the source; the open page
// re-reads the schema and re-renders, keeping the user's values.
if (import.meta.hot) {
  import.meta.hot.accept("../model/clamshell.scad?raw", (mod) => {
    if (!mod) return;
    source = mod.default as string;
    const hash = hash_hex(new TextEncoder().encode(source));
    for (const listener of sourceListeners) listener(hash);
  });
}

export function watchSource(onChange: (hash: string) => void): () => void {
  sourceListeners.add(onChange);
  return () => sourceListeners.delete(onChange);
}
