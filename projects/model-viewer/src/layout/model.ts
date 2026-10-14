import type { Params } from "../types";

/**
 * Compartment layout, mirroring the .scad parameters:
 *  - `cols` / `rows`: interior grid line positions as fractions (0..1)
 *  - `cells`: compartment id per grid cell, row-major, row 0 at the hinge
 * Adjacent cells with different ids get a wall; equal ids are one compartment.
 */
export interface Layout {
  cols: number[];
  rows: number[];
  cells: number[];
}

export type Axis = "x" | "y";

export const LAYOUT_PARAMS = ["col_splits", "row_splits", "cells"] as const;

export function supportsLayout(names: Iterable<string>): boolean {
  const set = new Set(names);
  return LAYOUT_PARAMS.every((n) => set.has(n));
}

export const colCount = (l: Layout) => l.cols.length + 1;
export const rowCount = (l: Layout) => l.rows.length + 1;
export const xLines = (l: Layout) => [0, ...l.cols, 1];
export const yLines = (l: Layout) => [0, ...l.rows, 1];
export const idAt = (l: Layout, r: number, c: number) => l.cells[r * colCount(l) + c];

const round4 = (f: number) => Math.round(f * 10000) / 10000;

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter((n) => Number.isFinite(n)) : [];
}

export function fromParams(params: Params): Layout {
  const cols = numbers(params.col_splits)
    .filter((f) => f > 0 && f < 1)
    .sort((a, b) => a - b);
  const rows = numbers(params.row_splits)
    .filter((f) => f > 0 && f < 1)
    .sort((a, b) => a - b);
  const size = (cols.length + 1) * (rows.length + 1);
  let cells = numbers(params.cells).map(Math.round);
  if (cells.length !== size) cells = Array.from({ length: size }, (_, k) => k);
  return normalize({ cols, rows, cells });
}

export function toParams(l: Layout): Params {
  return {
    col_splits: l.cols.map(round4),
    row_splits: l.rows.map(round4),
    cells: [...l.cells],
  };
}

export function sameLayout(a: Layout, b: Layout): boolean {
  return JSON.stringify(toParams(a)) === JSON.stringify(toParams(b));
}

/** Evenly spaced grid, one compartment per cell. */
export function evenGrid(cols: number, rows: number): Layout {
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  return {
    cols: Array.from({ length: c - 1 }, (_, i) => round4((i + 1) / c)),
    rows: Array.from({ length: r - 1 }, (_, i) => round4((i + 1) / r)),
    cells: Array.from({ length: c * r }, (_, k) => k),
  };
}

/** Keep the compartments, space every grid line evenly. */
export function equalize(l: Layout): Layout {
  const even = evenGrid(colCount(l), rowCount(l));
  return { ...l, cols: even.cols, rows: even.rows };
}

function transpose(l: Layout): Layout {
  const C = colCount(l);
  const R = rowCount(l);
  const cells: number[] = [];
  for (let c = 0; c < C; c++) for (let r = 0; r < R; r++) cells.push(l.cells[r * C + c]);
  return { cols: l.rows, rows: l.cols, cells };
}

/** Run an x-axis operation along y by transposing around it. */
function alongAxis(l: Layout, axis: Axis, op: (l: Layout) => Layout): Layout {
  return axis === "x" ? op(l) : transpose(op(transpose(l)));
}

/**
 * Relabel ids in first-seen order and drop grid lines that no longer carry a
 * wall anywhere, so equivalent layouts always serialise identically.
 */
export function normalize(l: Layout): Layout {
  let out = pruneAxis(l);
  out = transpose(pruneAxis(transpose(out)));
  return { ...out, cells: components(out) };
}

/**
 * Label connected compartments in first-seen order. Cells that share an id but
 * do not touch become separate compartments, so an id always means one pocket.
 */
function components(l: Layout): number[] {
  const C = colCount(l);
  const R = rowCount(l);
  const out = new Array<number>(l.cells.length).fill(-1);
  let next = 0;
  for (let start = 0; start < l.cells.length; start++) {
    if (out[start] !== -1) continue;
    const id = l.cells[start];
    const stack = [start];
    out[start] = next;
    while (stack.length) {
      const k = stack.pop()!;
      const r = Math.floor(k / C);
      const c = k % C;
      const around = [
        r > 0 ? k - C : -1,
        r < R - 1 ? k + C : -1,
        c > 0 ? k - 1 : -1,
        c < C - 1 ? k + 1 : -1,
      ];
      for (const n of around) {
        if (n >= 0 && out[n] === -1 && l.cells[n] === id) {
          out[n] = next;
          stack.push(n);
        }
      }
    }
    next++;
  }
  return out;
}

function pruneAxis(l: Layout): Layout {
  let cur = l;
  for (let b = colCount(cur) - 1; b >= 1; b--) {
    const C = colCount(cur);
    const R = rowCount(cur);
    let orphan = true;
    for (let r = 0; r < R && orphan; r++) {
      if (cur.cells[r * C + b - 1] !== cur.cells[r * C + b]) orphan = false;
    }
    if (!orphan) continue;
    const cells: number[] = [];
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) if (c !== b) cells.push(cur.cells[r * C + c]);
    cur = { ...cur, cols: cur.cols.filter((_, i) => i !== b - 1), cells };
  }
  return cur;
}

const EPS = 1e-4;

/**
 * Add a divider at fraction `f`. With `region`, only that compartment is cut
 * (a partial divider); otherwise every compartment the line crosses is cut.
 */
export function addLine(l: Layout, axis: Axis, f: number, region?: number): Layout {
  return normalize(
    alongAxis(l, axis, (g) => {
      const X = xLines(g);
      const R = rowCount(g);
      let C = colCount(g);
      let cells = g.cells;
      let cols = g.cols;

      // Reuse a line that is already (almost) there, otherwise insert one.
      let b = X.findIndex((x, i) => i > 0 && i < X.length - 1 && Math.abs(x - f) < EPS);
      if (b < 0) {
        const k = X.findIndex((x, i) => i < X.length - 1 && x < f && f < X[i + 1]);
        if (k < 0) return g;
        cols = [...g.cols.slice(0, k), round4(f), ...g.cols.slice(k)];
        const next: number[] = [];
        for (let r = 0; r < R; r++)
          for (let c = 0; c <= C; c++) next.push(g.cells[r * C + (c <= k ? c : c - 1)]);
        cells = next;
        C += 1;
        b = k + 1;
      }

      const crossing = new Set<number>();
      for (let r = 0; r < R; r++) {
        const left = cells[r * C + b - 1];
        if (left === cells[r * C + b] && (region === undefined || left === region))
          crossing.add(left);
      }
      if (crossing.size === 0) return g;

      let nextId = Math.max(...cells) + 1;
      const fresh = new Map<number, number>();
      const out = cells.map((id, k) => {
        if (k % C < b || !crossing.has(id)) return id;
        if (!fresh.has(id)) fresh.set(id, nextId++);
        return fresh.get(id)!;
      });
      return { ...g, cols, cells: out };
    }),
  );
}

/** Move interior line `line` (1-based grid line index) to fraction `f`. */
export function moveLine(l: Layout, axis: Axis, line: number, f: number, minGap: number): Layout {
  const splits = axis === "x" ? l.cols : l.rows;
  const lo = (line - 2 >= 0 ? splits[line - 2] : 0) + minGap;
  const hi = (line < splits.length ? splits[line] : 1) - minGap;
  if (lo > hi) return l;
  const next = [...splits];
  next[line - 1] = round4(Math.min(hi, Math.max(lo, f)));
  return axis === "x" ? { ...l, cols: next } : { ...l, rows: next };
}

/**
 * Merge compartments into one. Touching selections merge as-is (so L shapes are
 * possible); if they do not touch, everything in their bounding box is absorbed.
 */
export function merge(l: Layout, ids: number[]): Layout {
  if (ids.length < 2) return l;
  const target = ids[0];
  const set = new Set(ids);
  const merged = { ...l, cells: l.cells.map((id) => (set.has(id) ? target : id)) };
  const comps = components(merged);
  const touched = new Set(merged.cells.flatMap((id, k) => (id === target ? [comps[k]] : [])));
  if (touched.size <= 1) return normalize(merged);

  const C = colCount(l);
  let r0 = Infinity,
    r1 = -Infinity,
    c0 = Infinity,
    c1 = -Infinity;
  merged.cells.forEach((id, k) => {
    if (id !== target) return;
    const r = Math.floor(k / C);
    const c = k % C;
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
  });
  return normalize({
    ...merged,
    cells: merged.cells.map((id, k) => {
      const r = Math.floor(k / C);
      const c = k % C;
      return r >= r0 && r <= r1 && c >= c0 && c <= c1 ? target : id;
    }),
  });
}

/** Break compartments back into their individual grid cells. */
export function unmerge(l: Layout, ids: number[]): Layout {
  const set = new Set(ids);
  let nextId = Math.max(...l.cells) + 1;
  return normalize({ ...l, cells: l.cells.map((id) => (set.has(id) ? nextId++ : id)) });
}

/** Remove a whole grid line, merging whatever it separated. */
export function removeLine(l: Layout, axis: Axis, line: number): Layout {
  const C = colCount(l);
  const R = rowCount(l);
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  if (axis === "x")
    for (let r = 0; r < R; r++) union(l.cells[r * C + line - 1], l.cells[r * C + line]);
  else for (let c = 0; c < C; c++) union(l.cells[(line - 1) * C + c], l.cells[line * C + c]);
  return normalize({ ...l, cells: l.cells.map(find) });
}

export interface Wall {
  axis: Axis;
  /** grid line index (1..n-1) */
  line: number;
  /** row (for x walls) or column (for y walls) */
  index: number;
  a: number;
  b: number;
}

export function walls(l: Layout): Wall[] {
  const C = colCount(l);
  const R = rowCount(l);
  const out: Wall[] = [];
  for (let line = 1; line < C; line++)
    for (let r = 0; r < R; r++) {
      const a = l.cells[r * C + line - 1];
      const b = l.cells[r * C + line];
      if (a !== b) out.push({ axis: "x", line, index: r, a, b });
    }
  for (let line = 1; line < R; line++)
    for (let c = 0; c < C; c++) {
      const a = l.cells[(line - 1) * C + c];
      const b = l.cells[line * C + c];
      if (a !== b) out.push({ axis: "y", line, index: c, a, b });
    }
  return out;
}

export interface Region {
  id: number;
  cells: { r: number; c: number }[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  rectangular: boolean;
  /** fraction-space point to anchor the label */
  label: { x: number; y: number };
  /** fraction-space area */
  area: number;
}

export function regions(l: Layout): Region[] {
  const C = colCount(l);
  const X = xLines(l);
  const Y = yLines(l);
  const byId = new Map<number, Region>();
  l.cells.forEach((id, k) => {
    const r = Math.floor(k / C);
    const c = k % C;
    let reg = byId.get(id);
    if (!reg) {
      reg = {
        id,
        cells: [],
        x0: 1,
        x1: 0,
        y0: 1,
        y1: 0,
        rectangular: true,
        label: { x: 0, y: 0 },
        area: 0,
      };
      byId.set(id, reg);
    }
    reg.cells.push({ r, c });
    reg.x0 = Math.min(reg.x0, X[c]);
    reg.x1 = Math.max(reg.x1, X[c + 1]);
    reg.y0 = Math.min(reg.y0, Y[r]);
    reg.y1 = Math.max(reg.y1, Y[r + 1]);
    reg.area += (X[c + 1] - X[c]) * (Y[r + 1] - Y[r]);
  });
  for (const reg of byId.values()) {
    reg.rectangular = Math.abs(reg.area - (reg.x1 - reg.x0) * (reg.y1 - reg.y0)) < 1e-6;
    if (reg.rectangular) {
      reg.label = { x: (reg.x0 + reg.x1) / 2, y: (reg.y0 + reg.y1) / 2 };
    } else {
      const biggest = reg.cells.reduce(
        (best, cell) => {
          const size = (X[cell.c + 1] - X[cell.c]) * (Y[cell.r + 1] - Y[cell.r]);
          return size > best.size ? { cell, size } : best;
        },
        { cell: reg.cells[0], size: -1 },
      ).cell;
      reg.label = {
        x: (X[biggest.c] + X[biggest.c + 1]) / 2,
        y: (Y[biggest.r] + Y[biggest.r + 1]) / 2,
      };
    }
  }
  return [...byId.values()];
}

export function regionAt(l: Layout, fx: number, fy: number): number | undefined {
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return undefined;
  const X = xLines(l);
  const Y = yLines(l);
  const c = Math.min(
    colCount(l) - 1,
    Math.max(
      0,
      X.findIndex((x, i) => fx >= x && fx <= X[i + 1]),
    ),
  );
  const r = Math.min(
    rowCount(l) - 1,
    Math.max(
      0,
      Y.findIndex((y, i) => fy >= y && fy <= Y[i + 1]),
    ),
  );
  return idAt(l, r, c);
}
