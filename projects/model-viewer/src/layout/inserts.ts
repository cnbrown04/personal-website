import type { Params } from "../types";
import * as L from "./model";

/** A compartment filled solid, anchored by a point so it survives layout edits. */
export interface Fill {
  fx: number;
  fy: number;
  height: number;
}

export type PocketStyle = "silhouette" | "exact";

/** A mesh pressed into a fill as a negative pocket (mirrors the .scad `tools` rows). */
export interface Tool {
  file: string;
  /** footprint centre, mm from the interior's left / hinge-side corner */
  x: number;
  y: number;
  /** degrees: rx/ry lay the tool down, then rz turns it */
  rz: number;
  rx: number;
  ry: number;
  depth: number;
  clearance: number;
  style: PocketStyle;
  /** centres the laid-down footprint on the origin with its lowest point at z = 0 */
  ox: number;
  oy: number;
  oz: number;
}

export interface ToolMesh {
  name: string;
  /** expanded triangle positions in the file's own frame */
  positions: Float32Array;
  normals: Float32Array;
}

export const INSERT_PARAMS = ["fills", "tools"] as const;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function supportsInserts(names: Iterable<string>): boolean {
  const set = new Set(names);
  return INSERT_PARAMS.every((n) => set.has(n));
}

export function fillsFromParams(params: Params): Fill[] {
  const raw = Array.isArray(params.fills) ? (params.fills as unknown[]) : [];
  return raw
    .filter((f): f is number[] => Array.isArray(f) && f.length >= 3)
    .map((f) => ({ fx: Number(f[0]), fy: Number(f[1]), height: Number(f[2]) }));
}

export function toolsFromParams(params: Params): Tool[] {
  const raw = Array.isArray(params.tools) ? (params.tools as unknown[]) : [];
  return raw
    .filter((t): t is unknown[] => Array.isArray(t) && t.length >= 12)
    .map((t) => ({
      file: String(t[0]),
      x: Number(t[1]),
      y: Number(t[2]),
      rz: Number(t[3]),
      rx: Number(t[4]),
      ry: Number(t[5]),
      depth: Number(t[6]),
      clearance: Number(t[7]),
      style: t[8] === "exact" ? "exact" : "silhouette",
      ox: Number(t[9]),
      oy: Number(t[10]),
      oz: Number(t[11]),
    }));
}

export function fillsToParam(fills: Fill[]): Params["fills"] {
  return fills.map((f) => [r3(f.fx), r3(f.fy), r3(f.height)]) as unknown as Params["fills"];
}

export function toolsToParam(tools: Tool[]): Params["tools"] {
  return tools.map((t) => [
    t.file,
    r3(t.x),
    r3(t.y),
    r3(t.rz),
    t.rx,
    t.ry,
    r3(t.depth),
    r3(t.clearance),
    t.style,
    r3(t.ox),
    r3(t.oy),
    r3(t.oz),
  ]) as unknown as Params["tools"];
}

/** Index of the fill covering a compartment, or -1. */
export function fillFor(layout: L.Layout, fills: Fill[], regionId: number): number {
  return fills.findIndex((f) => L.regionAt(layout, f.fx, f.fy) === regionId);
}

/** Drop fills that point at the same compartment (the first one wins). */
export function dedupeFills(layout: L.Layout, fills: Fill[]): Fill[] {
  const seen = new Set<number>();
  return fills.filter((f) => {
    const id = L.regionAt(layout, f.fx, f.fy);
    if (id === undefined || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** OpenSCAD rotate([rx, ry, 0]): about X, then about Y. */
function layVertex(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
): [number, number, number] {
  const ax = (rx * Math.PI) / 180;
  const ay = (ry * Math.PI) / 180;
  const y1 = y * Math.cos(ax) - z * Math.sin(ax);
  const z1 = y * Math.sin(ax) + z * Math.cos(ax);
  const x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
  const z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
  return [x2, y1, z2];
}

export interface LaidBounds {
  ox: number;
  oy: number;
  oz: number;
  /** size once laid down: footprint x/y and height */
  sx: number;
  sy: number;
  sz: number;
}

export function laidBounds(mesh: ToolMesh, rx: number, ry: number): LaidBounds {
  const p = mesh.positions;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = layVertex(p[i], p[i + 1], p[i + 2], rx, ry);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    ox: -(minX + maxX) / 2,
    oy: -(minY + maxY) / 2,
    oz: -minZ,
    sx: maxX - minX,
    sy: maxY - minY,
    sz: maxZ - minZ,
  };
}

/** The six ways to rest a part on the fill. */
export const LAYS: [number, number][] = [
  [0, 0],
  [180, 0],
  [90, 0],
  [-90, 0],
  [0, 90],
  [0, -90],
];

/** Re-lay a tool (keeping its position) and recompute its offsets. */
export function relay(tool: Tool, mesh: ToolMesh, rx: number, ry: number): Tool {
  const b = laidBounds(mesh, rx, ry);
  return { ...tool, rx, ry, ox: b.ox, oy: b.oy, oz: b.oz };
}

/**
 * Place a new tool in a compartment: thinnest side down, long side along the
 * compartment's long side, sunk ~60% of its thickness.
 */
export function autoPlace(
  file: string,
  mesh: ToolMesh,
  rect: { x0: number; y0: number; x1: number; y1: number },
  fillHeight: number,
): Tool {
  let best = LAYS[0];
  let bestHeight = Infinity;
  for (const lay of [LAYS[0], LAYS[2], LAYS[4]]) {
    const b = laidBounds(mesh, lay[0], lay[1]);
    if (b.sz < bestHeight - 1e-6) {
      bestHeight = b.sz;
      best = lay;
    }
  }
  const b = laidBounds(mesh, best[0], best[1]);
  const wide = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
  const rz = b.sx >= b.sy === wide ? 0 : 90;
  const depth = Math.max(1, Math.min(fillHeight, Math.round(b.sz * 0.6 * 2) / 2));
  return {
    file,
    x: (rect.x0 + rect.x1) / 2,
    y: (rect.y0 + rect.y1) / 2,
    rz,
    rx: best[0],
    ry: best[1],
    depth,
    clearance: 0.5,
    style: "silhouette",
    ox: b.ox,
    oy: b.oy,
    oz: b.oz,
  };
}

/** Footprint half-extents of a placed tool (axis-aligned, after rz), in mm. */
export function footprint(tool: Tool, mesh: ToolMesh): { hx: number; hy: number } {
  const b = laidBounds(mesh, tool.rx, tool.ry);
  const a = (tool.rz * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return {
    hx: (b.sx * c + b.sy * s) / 2 + tool.clearance,
    hy: (b.sx * s + b.sy * c) / 2 + tool.clearance,
  };
}
