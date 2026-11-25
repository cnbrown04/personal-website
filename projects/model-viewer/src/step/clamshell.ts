// The clamshell rebuilt in OpenCascade (via replicad) for STEP export, so CAD
// tools get exact cylinders, cones and arcs instead of a triangle mesh.
//
// This mirrors model/clamshell.scad module by module; the names below match the
// scad's. It never computes a size itself: every resolved value comes from the
// scad's MV_DIMS echo (see Dims), so the two can only drift in construction, and
// `mise run check:step` compares them part by part. Change one, change the other.
//
// Shapes are first built as plain point data (Prim), transformed exactly like the
// scad's translate/rotate/mirror, and only turned into OpenCascade solids at the
// end. Flat-faced pieces become polyhedra; round ones become true cylinders and
// cones where the scad has 32-sided approximations.
//
// No relative imports, so `node` can load this file directly for the check.

import type { Shape3D, Sketch } from "replicad";
import {
  assembleWire,
  drawRoundedRectangle,
  loft,
  makeCircle,
  makeCylinder,
  makePolygon,
  makeSolid,
} from "replicad";

/** Resolved sizes echoed by the scad as `MV_DIMS=[[name, value], ...]`. */
export interface Dims {
  box_w: number;
  box_d: number;
  box_h: number;
  label_w: number;
  label_h: number;
  label_h_loc: number;
  footy: boolean;
  base_w: number;
  base_d: number;
  base_h: number;
  base_outer_d: number;
  base_t: number;
  base_lip_top_h: number;
  base_lip_bot_h: number;
  lid_w: number;
  lid_h: number;
  lid_outer_d: number;
  lid_side_t: number;
  lid_fb_t: number;
  lid_lip_bot_h: number;
  lid_lip_top_h: number;
  hinge_clear: number;
  hinge_dia: number;
  hinge_axis_len: number;
  hinge_comp_len: number;
  front_snap: boolean;
  side_snaps: boolean;
  snap_w: number;
  snap_xs: number[];
  snap_depth: number;
  snap_catch: number;
  snap_h: number;
  side_snap_l: number;
  side_snap_d: number;
  side_snap_c: number;
  side_snap_zh: number;
  side_snap_z: number;
  pry: boolean;
  notch_h: number;
  notch_c: number;
  notch_b: number;
  notch_r: number;
  div_t: number;
  shell_bottom_t: number;
  box_internal_w: number;
  box_internal_d: number;
  box_internal_h: number;
  lid_internal_d: number;
  lid_internal_h: number;
  xs: number[];
  ys: number[];
  cells: number[];
  lid_ys: number[];
  lid_cells: number[];
  lid_dividers: boolean;
  bottom_chamfer: boolean;
  chamfer_size: number;
  divider_color: string;
  insert_color: string;
  fills: [number, number, number][];
  /** how many imported tool meshes there are */
  tools: number;
  /** finger scoops: [x0, x1, y, radius] in the base divider grid */
  scoops: number[][];
  /** the Gridfinity bin (generate_gridfinity) */
  gridfinity: boolean;
  gf_x: number;
  gf_y: number;
  gf_w: number;
  gf_d: number;
  gf_r: number;
  gf_floor: number;
  gf_h: number;
  gf_c: number;
  gf_pw: number;
  gf_ph: number;
  gf_pk: number;
  gf_recess: number;
  /** [u0, u1, v0, v1] in a pocket's frame */
  gf_recesses: number[][];
  gf_turn: boolean;
  /** pocket centres */
  gf_pockets: number[][];
  gf_magnets: boolean;
  gf_at: number;
  gf_mag_r: number;
  gf_mag_h: number;
  gf_mag_ribs: boolean;
  gf_rib_r: number;
}

/** Reads the dims from an OpenSCAD log run with `mv_part = "dims"`. */
export function parseDims(log: string): Dims {
  const line = log.split("\n").find((l) => l.includes("MV_DIMS="));
  if (!line) throw new Error("the model did not report its sizes");
  const json = line.slice(line.indexOf("MV_DIMS=") + 8).replace(/"\s*$/, "");
  return Object.fromEntries(JSON.parse(json) as [string, unknown][]) as unknown as Dims;
}

export interface Parts {
  base: Shape3D;
  lid: Shape3D;
  dividers: Shape3D | null;
  inserts: Shape3D | null;
  gridfinity: Shape3D | null;
}

// ---------------------------------------------------------------- prims

type V3 = [number, number, number];
type V2 = [number, number];

type Prim =
  | { kind: "poly"; pts: V3[]; faces: number[][] }
  /** a cylinder or cone: base centre p, unit axis d, height h, radii r1 -> r2;
   * with s, the top centre is shifted sideways by s (a hull of the two circles) */
  | { kind: "cone"; p: V3; d: V3; h: number; r1: number; r2: number; s?: V3 };

const DEG = Math.PI / 180;

function rotX(p: V3, a: number): V3 {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotY(p: V3, a: number): V3 {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotZ(p: V3, a: number): V3 {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

/** Applies a point map to prims; `dir` maps directions (no translation). */
function mapPrims(prims: Prim[], pt: (p: V3) => V3, dir: (d: V3) => V3, flips = false): Prim[] {
  return prims.map((q) =>
    q.kind === "poly"
      ? {
          kind: "poly",
          pts: q.pts.map(pt),
          faces: flips ? q.faces.map((f) => [...f].reverse()) : q.faces,
        }
      : { ...q, p: pt(q.p), d: dir(q.d), ...(q.s ? { s: dir(q.s) } : {}) },
  );
}

/** OpenSCAD translate(). */
function T(v: V3, prims: Prim[]): Prim[] {
  return mapPrims(
    prims,
    (p) => [p[0] + v[0], p[1] + v[1], p[2] + v[2]],
    (d) => d,
  );
}

/** OpenSCAD rotate([a, b, c]): x first, then y, then z. */
function R(a: V3, prims: Prim[]): Prim[] {
  const f = (p: V3) => rotZ(rotY(rotX(p, a[0]), a[1]), a[2]);
  return mapPrims(prims, f, f);
}

function poly(pts: V3[], faces: number[][]): Prim[] {
  return [{ kind: "poly", pts, faces }];
}

/** A polygon (counter-clockwise or not) extruded along +z from z0 to z1. */
function prismZ(pg: V2[], z0: number, z1: number): Prim[] {
  const n = pg.length;
  const pts: V3[] = [...pg.map(([x, y]): V3 => [x, y, z0]), ...pg.map(([x, y]): V3 => [x, y, z1])];
  const faces = [
    [...Array(n).keys()].reverse(),
    [...Array(n).keys()].map((i) => i + n),
    ...[...Array(n).keys()].map((i) => [i, (i + 1) % n, ((i + 1) % n) + n, i + n]),
  ];
  return poly(pts, faces);
}

/** Polygons with the same number of points stacked at heights zs, joined by
 * flat sides: one solid through all of them. */
function rings(pgs: V2[][], zs: number[]): Prim[] {
  const n = pgs[0].length;
  const pts: V3[] = pgs.flatMap((pg, k) => pg.map(([x, y]): V3 => [x, y, zs[k]]));
  const ring = (k: number) => [...Array(n).keys()].map((i) => i + k * n);
  const sides = (k: number) =>
    [...Array(n).keys()].map((i) => [
      i + k * n,
      ((i + 1) % n) + k * n,
      ((i + 1) % n) + (k + 1) * n,
      i + (k + 1) * n,
    ]);
  const faces = [ring(0).reverse(), ring(pgs.length - 1)];
  for (let k = 0; k + 1 < pgs.length; k++) faces.push(...sides(k));
  return poly(pts, faces);
}

/** OpenSCAD linear_extrude(h, center) of a polygon. */
function linearExtrude(pg: V2[], h: number, center = false): Prim[] {
  return center ? prismZ(pg, -h / 2, h / 2) : prismZ(pg, 0, h);
}

/** cube(size), at the origin corner. */
function cube(s: V3): Prim[] {
  return prismZ(
    [
      [0, 0],
      [s[0], 0],
      [s[0], s[1]],
      [0, s[1]],
    ],
    0,
    s[2],
  );
}

const orientRot = (dir: string): V3 =>
  dir === "right"
    ? [0, 90, 0]
    : dir === "left"
      ? [0, -90, 0]
      : dir === "back"
        ? [-90, 0, 0]
        : [0, 0, 0];

/** _prismoid(size1, size2, h, shift, orient) */
function prismoid(s1: V2, s2: V2, h: number, shift: V2 = [0, 0], orient = "up"): Prim[] {
  const [x1, y1] = [s1[0] / 2, s1[1] / 2];
  const [x2, y2] = [s2[0] / 2, s2[1] / 2];
  const [sx, sy] = shift;
  return R(
    orientRot(orient),
    poly(
      [
        [-x1, -y1, 0],
        [x1, -y1, 0],
        [x1, y1, 0],
        [-x1, y1, 0],
        [sx - x2, sy - y2, h],
        [sx + x2, sy - y2, h],
        [sx + x2, sy + y2, h],
        [sx - x2, sy + y2, h],
      ],
      [
        [0, 1, 2, 3],
        [4, 7, 6, 5],
        [0, 4, 5, 1],
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0],
      ],
    ),
  );
}

/** cylinder(h, r1, r2), bottom at the origin, along +z. */
function cyl(h: number, r1: number, r2 = r1, center = false): Prim[] {
  return [{ kind: "cone", p: [0, 0, center ? -h / 2 : 0], d: [0, 0, 1], h, r1, r2 }];
}

/** _cyl(h, r1, r2, orient) */
function orientedCyl(h: number, r1: number, r2: number, orient: string): Prim[] {
  return R(orientRot(orient), cyl(h, r1, r2));
}

/** _right_triangle(size, spin) */
function rightTriangle(size: V2, spin = 0): V2[] {
  return (
    [
      [size[0], 0],
      [0, 0],
      [0, size[1]],
    ] as V2[]
  ).map(([x, y]) => {
    const p = rotZ([x, y, 0], spin);
    return [p[0], p[1]];
  });
}

// ---------------------------------------------------------------- helpers

/** _chamfered_outline(l, w, fc, bc), counter-clockwise */
function chamferedOutline(l: number, w: number, fc: number, bc: number): V2[] {
  return [
    [-l / 2 + bc, -w / 2],
    [l / 2 - bc, -w / 2],
    [l / 2, -w / 2 + bc],
    [l / 2, w / 2 - fc],
    [l / 2 - fc, w / 2],
    [-l / 2 + fc, w / 2],
    [-l / 2, w / 2 - fc],
    [-l / 2, -w / 2 + bc],
  ];
}

/** offset(delta = d) of a convex counter-clockwise polygon (mitred corners). */
function offsetConvex(pg: V2[], d: number): V2[] {
  const n = pg.length;
  const lines = pg.map((a, i) => {
    const b = pg[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // outward normal of a counter-clockwise edge
    const nx = (b[1] - a[1]) / len;
    const ny = -(b[0] - a[0]) / len;
    return { p: [a[0] + nx * d, a[1] + ny * d] as V2, v: [b[0] - a[0], b[1] - a[1]] as V2 };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    // intersect l0 and l1
    const den = l0.v[0] * l1.v[1] - l0.v[1] * l1.v[0];
    const t = ((l1.p[0] - l0.p[0]) * l1.v[1] - (l1.p[1] - l0.p[1]) * l1.v[0]) / den;
    return [l0.p[0] + l0.v[0] * t, l0.p[1] + l0.v[1] * t];
  });
}

/** generate_edge_chamfered_cuboid(l, w, h, fc, bc): the hull of the outline from
 * z = 2 to h and the outline shrunk by 2 at z = 0. */
function chamferedCuboid(l: number, w: number, h: number, fc: number, bc: number): Prim[] {
  const o = chamferedOutline(l, w, fc, bc);
  const b = offsetConvex(o, -2);
  const n = o.length;
  const pts: V3[] = [
    ...b.map(([x, y]): V3 => [x, y, 0]),
    ...o.map(([x, y]): V3 => [x, y, 2]),
    ...o.map(([x, y]): V3 => [x, y, h]),
  ];
  const ring = (k: number) => [...Array(n).keys()].map((i) => i + k * n);
  const sides = (k: number) =>
    [...Array(n).keys()].map((i) => [
      i + k * n,
      ((i + 1) % n) + k * n,
      ((i + 1) % n) + (k + 1) * n,
      i + (k + 1) * n,
    ]);
  return poly(pts, [ring(0).reverse(), ring(2), ...sides(0), ...sides(1)]);
}

/** _grip_pair_on_side(sx, l, y, z_base, gap) */
function gripPair(sx: number, l: number, y: number, zBase: number, gap: number): Prim[] {
  const [wBot, hBot, wTop, hTop, depth] = [1.5, 10, 0.5, 9, 0.5];
  return [0, 1].flatMap((k) =>
    T(
      [(sx * l) / 2, y, zBase + wBot / 2 + k * (wBot + gap)],
      prismoid([wBot, hBot], [wTop, hTop], depth, [0, 0], sx === 1 ? "right" : "left"),
    ),
  );
}

// ---------------------------------------------------------------- feet

// biome-ignore format: mesh data copied from the scad
const FOOT_PTS: V3[] = [
  [-4, -2.5, 0], [-4.88763, -1.61237, 0.887627], [-4, -2.5, 1.25529], [-3.96839, -2.5, 1.3],
  [-5, -1.34108, 1], [-4, 2.5, 0], [-5, 2.5, 1], [-5, 2.5, 1.925], [-3.96839, 0.125, 3.925],
  [-4.23355, 0.5, 3.925], [-5, 1.04196, 3.38304], [4, -2.5, 0], [4.88763, -1.61237, 0.887627],
  [4, -2.5, 1.25529], [3.96839, -2.5, 1.3], [5, -1.34108, 1], [4, 2.5, 0], [5, 2.5, 1],
  [5, 2.5, 1.925], [3.96839, 0.125, 3.925], [4.23355, 0.5, 3.925], [5, 1.04196, 3.38304],
];
// biome-ignore format: mesh data copied from the scad
const FOOT_FACES = [
  [2, 0, 1], [11, 13, 12], [0, 5, 1], [6, 4, 1], [5, 6, 1], [16, 11, 12], [15, 17, 12], [17, 16, 12],
  [8, 14, 3], [14, 8, 19], [10, 20, 9], [20, 10, 7], [18, 21, 7], [21, 20, 7], [14, 15, 13],
  [13, 15, 12], [19, 15, 14], [20, 15, 19], [20, 21, 15], [3, 2, 1], [4, 10, 1], [8, 3, 1],
  [10, 9, 1], [9, 8, 1], [2, 3, 0], [11, 0, 3], [5, 0, 11], [6, 7, 4], [18, 6, 5], [7, 6, 18],
  [7, 10, 4], [19, 8, 9], [13, 11, 3], [14, 13, 3], [11, 16, 5], [16, 18, 5], [15, 21, 17],
  [16, 17, 18], [20, 19, 9], [21, 18, 17],
];
// biome-ignore format: mesh data copied from the scad
const POCKET_PTS: V3[] = [
  [-4.2, -2.7, -0.2], [-5.2, -2.7, 0.8], [-5.2, -2.7, 2.125], [-5.2, -1.24196, 3.58304],
  [-5.2, -0.84196, 3.58304], [-4.43355, -0.7, 4.125], [-4.43355, -0.3, 4.125],
  [-5.08763, 1.41237, 0.687627], [-5.2, 1.54108, 0.8], [-5.08763, 1.81237, 0.687627],
  [-4.2, 2.7, -0.2], [-5.2, 1.54108, 1.2], [-5.08763, 1.81237, 1.08763], [-4.2, 2.7, 1.45529],
  [-4.16839, 2.7, 1.5], [-4.16839, 0.075, 4.125], [4.2, -2.7, -0.2], [5.2, -2.7, 0.8],
  [5.2, -2.7, 2.125], [5.2, -1.24196, 3.58304], [5.2, -0.84196, 3.58304], [4.43355, -0.7, 4.125],
  [4.43355, -0.3, 4.125], [5.08763, 1.41237, 0.687627], [5.2, 1.54108, 0.8],
  [5.08763, 1.81237, 0.687627], [4.2, 2.7, -0.2], [5.2, 1.54108, 1.2], [5.08763, 1.81237, 1.08763],
  [4.2, 2.7, 1.45529], [4.16839, 2.7, 1.5], [4.16839, 0.075, 4.125],
];
// biome-ignore format: mesh data copied from the scad
const POCKET_FACES = [
  [0, 7, 1], [1, 8, 2], [1, 17, 0], [2, 17, 1], [16, 10, 0], [2, 3, 5], [2, 8, 3], [3, 8, 4],
  [4, 6, 3], [3, 6, 5], [5, 21, 2], [5, 6, 21], [31, 6, 15], [10, 7, 0], [1, 7, 8], [4, 8, 11],
  [8, 7, 9], [9, 7, 10], [13, 9, 10], [8, 9, 11], [11, 9, 12], [12, 9, 13], [10, 29, 13],
  [13, 29, 14], [11, 6, 4], [12, 6, 11], [6, 13, 15], [12, 13, 6], [15, 13, 14], [14, 31, 15],
  [0, 17, 16], [18, 17, 2], [17, 23, 16], [18, 27, 17], [2, 21, 18], [21, 6, 22], [22, 6, 31],
  [21, 19, 18], [19, 27, 18], [20, 27, 19], [20, 19, 22], [22, 19, 21], [26, 10, 16],
  [26, 29, 10], [14, 29, 30], [16, 25, 26], [23, 25, 16], [17, 25, 23], [24, 25, 17],
  [17, 27, 24], [26, 25, 29], [27, 25, 24], [28, 25, 27], [29, 25, 28], [30, 31, 14],
  [22, 27, 20], [28, 27, 22], [31, 29, 22], [30, 29, 31], [22, 29, 28],
];

const foot = (x: number, y: number) => T([x, y, 0], poly(FOOT_PTS, FOOT_FACES));
const footPocket = (x: number, y: number) => T([x, y, 0], poly(POCKET_PTS, POCKET_FACES));

// ---------------------------------------------------------------- hinge

/** generate_hinge_components(bot, cuts) */
function hinge(D: Dims, bot: boolean, cuts: boolean): Prim[] {
  const clear = D.hinge_clear;
  const dia = D.hinge_dia;
  // These read the module-level hinge_comp_len, before the scad shadows it below.
  const wClear = 2 * D.hinge_comp_len + clear;
  const segs = Math.floor((D.hinge_axis_len - 2 * D.hinge_comp_len) / wClear);
  const n = segs + (1 - (segs % 2));
  const endSeg = 3;
  const newHinge = (D.hinge_axis_len - 2 * endSeg - clear) / n;
  const comp = (newHinge - clear) / 2;
  const [coneBot, coneTop, coneLen] = [2.5, 0.5, 1.0];
  const wedge = (len: number): Prim[] =>
    R(
      [0, 90, 0],
      linearExtrude(
        [
          [0, 0.5],
          [2.63, 0.5],
          [0.8677, -1.2232],
        ],
        len,
      ),
    );
  const at = (x: number, p: Prim[]) => T([x, 0, 0], p);
  const out: Prim[] = [];
  const evens = [...Array(n).keys()].filter((i) => i % 2 === 0);
  const odds = [...Array(n).keys()].filter((i) => i % 2 === 1);
  const tail = 9.5 + endSeg + clear + n * (2 * comp + clear);

  if (bot && cuts) {
    for (const i of evens)
      out.push(
        ...at(
          9.5 + endSeg + i * (2 * comp + clear),
          orientedCyl(2 * comp + 2 * clear, dia / 2 + clear, dia / 2 + clear, "right"),
        ),
      );
  }
  if (!bot && !cuts) {
    // Lid knuckles: a barrel plus wedge. The cone dimple at each end is cut by
    // generateLid, from lidKnuckleDimples().
    for (const i of evens) {
      const loc = 9.5 + endSeg + i * (2 * comp + clear) + clear;
      out.push(
        ...at(loc, orientedCyl(2 * comp, dia / 2, dia / 2, "right")),
        ...at(loc, wedge(2 * comp)),
      );
    }
  }
  if (bot && !cuts) {
    out.push(
      ...at(9.5, orientedCyl(endSeg, dia / 2, dia / 2, "right")),
      ...at(9.5, wedge(endSeg)),
      ...at(9.5 + endSeg, orientedCyl(coneLen, coneBot / 2, coneTop / 2, "right")),
      ...at(tail, orientedCyl(endSeg, dia / 2, dia / 2, "right")),
      ...at(tail, wedge(endSeg)),
      ...at(tail, orientedCyl(coneLen, coneBot / 2, coneTop / 2, "left")),
    );
    for (const i of odds) {
      const loc = 9.5 + endSeg + i * (2 * comp + clear) + clear;
      out.push(
        ...at(loc, orientedCyl(2 * comp, dia / 2, dia / 2, "right")),
        ...at(loc, wedge(2 * comp)),
        ...at(loc, orientedCyl(coneLen, coneBot / 2, coneTop / 2, "left")),
        ...at(loc + 2 * comp, orientedCyl(coneLen, coneBot / 2, coneTop / 2, "right")),
      );
    }
  }
  if (!bot && cuts) {
    out.push(
      ...at(9, orientedCyl(endSeg + 0.75, dia / 2 + clear, dia / 2 + clear, "right")),
      ...at(
        9.25 + endSeg + clear + n * (2 * comp + clear),
        orientedCyl(endSeg + 0.75, dia / 2 + clear, dia / 2 + clear, "right"),
      ),
    );
    for (const i of odds)
      out.push(
        ...at(
          9.5 + endSeg + i * (2 * comp + clear),
          orientedCyl(2 * comp + 2 * clear, dia / 2 + clear, dia / 2 + clear, "right"),
        ),
      );
    for (const i of evens)
      out.push(
        ...at(
          9.5 + endSeg + i * (2 * comp + clear),
          orientedCyl(2 * comp + 2 * clear, dia / 2 - 0.2, dia / 2 - 0.2, "right"),
        ),
      );
  }
  return out;
}

/** The cone dimples cut into the ends of each lid knuckle. */
function lidKnuckleDimples(D: Dims): Prim[] {
  const clear = D.hinge_clear;
  const wClear = 2 * D.hinge_comp_len + clear;
  const segs = Math.floor((D.hinge_axis_len - 2 * D.hinge_comp_len) / wClear);
  const n = segs + (1 - (segs % 2));
  const comp = ((D.hinge_axis_len - 6 - clear) / n - clear) / 2;
  const out: Prim[] = [];
  for (let i = 0; i < n; i += 2) {
    const loc = 9.5 + 3 + i * (2 * comp + clear) + clear;
    out.push(
      ...T([loc, 0, 0], orientedCyl(1, 1.25, 0.25, "right")),
      ...T([loc + 2 * comp, 0, 0], orientedCyl(1, 1.25, 0.25, "left")),
    );
  }
  return out;
}

// ---------------------------------------------------------------- shells

/** generate_base_shell, split into what is added and what is cut. */
function baseShell(D: Dims, l: number, w: number, innerH: number, outerH: number, t: number) {
  const add: Prim[] = [
    ...chamferedCuboid(l, w, outerH, 6, 6),
    ...T([0, 0.5, 0], chamferedCuboid(l - t - 0.2, w - t - 0.2 - 1, innerH, 5.3556, 4.3556)),
  ];
  const cavity = T(
    [0, 0.5, 1.6],
    chamferedCuboid(l - 2 * t, w - 2 * t - 1, innerH, 4.8284, 3.8284),
  );
  // added after the cavity is cut
  const bump = T([0, w / 2 - t / 2, outerH], prismoid([D.box_w - 18.1, t], [D.box_w - 30.1, t], 6));
  const slot = T(
    [0, -w / 2 + 2.1 / 2, outerH - (D.box_h / 2 - 8)],
    prismoid([D.base_w - 19, 2.1], [D.base_w - 10, 2.1], D.box_h / 2 - 8),
  );
  const extra: Prim[] = [];
  const yGrip = w / 2 - 16;
  extra.push(...gripPair(1, l, yGrip, 2.95, 0.95), ...gripPair(-1, l, yGrip, 2.95, 0.95));
  if (D.footy)
    extra.push(
      ...foot(D.base_w / 2 - 16.82843 - 5, -w / 2),
      ...foot(-D.base_w / 2 + 16.82843 + 5, -w / 2),
    );
  return { add, cavity, bump, slot, extra };
}

/** generate_lid_shell, split the same way. */
function lidShell(
  D: Dims,
  l: number,
  w: number,
  h: number,
  outerH: number,
  sideT: number,
  fbT: number,
) {
  const outerCham = 6;
  const upper0 = 5.47279;
  const upper1 = upper0 - 1;
  const lowerInner = 3.82843;
  const [yTrim, zTrim] = [0.5, 1.6];
  const [shrinkX, shrinkY] = [1.8, 2.8];
  const triThick = 0.5;
  const triInset = 1.27279;

  const outer = chamferedCuboid(l, w, h, outerCham, outerCham);
  const upperTrim = T(
    [0, yTrim, zTrim],
    chamferedCuboid(l - shrinkX, w - shrinkY, h, upper0, upper1),
  );
  // corner trim wedge: a diamond prism along x, minus a triangle at each end
  const r = 0.5;
  const diamond = T(
    [0, w / 2 - 1.25 + 0.35, h],
    R(
      [0, 90, 0],
      linearExtrude(
        [
          [r, 0],
          [0, r],
          [-r, 0],
          [0, -r],
        ],
        l - 12 + 0.1,
        true,
      ),
    ),
  );
  const wedgeKeep = [
    ...T(
      [l / 2 - triInset, w / 2, h - triThick],
      linearExtrude(rightTriangle([6, 6], 180), triThick),
    ),
    ...T(
      [-l / 2 + triInset, w / 2, h - triThick],
      linearExtrude(rightTriangle([6, 6], 270), triThick),
    ),
  ];
  const lowerEdge = chamferedCuboid(l, w, h - 3, outerCham, outerCham);
  const cavity = T(
    [0, 0, zTrim],
    chamferedCuboid(l - 2 * sideT, w - 2 * fbT, h, lowerInner, lowerInner),
  );

  const hingeBump = T(
    [0, -w / 2 + 1.9 / 2, outerH],
    prismoid([l - 10, 1.9], [l - 19, 1.9], D.box_h / 2 - D.lid_h - 0.1),
  );
  const hingeBumpTrim = [
    ...T([-l / 2, -w / 2, outerH - 1], linearExtrude(rightTriangle([6, 6]), 5)),
    ...T([l / 2, -w / 2, outerH - 1], linearExtrude(rightTriangle([6, 6], 90), 5)),
  ];
  const extra: Prim[] = [];
  const yGrip = w / 2 - 16;
  extra.push(...gripPair(1, l, yGrip, 2.95, 1.0), ...gripPair(-1, l, yGrip, 2.95, 1.0));
  if (D.footy)
    extra.push(
      ...foot(D.base_w / 2 - 5.82843 - 5, -w / 2),
      ...foot(-D.base_w / 2 + 5.82843 + 5, -w / 2),
    );
  return {
    outer,
    upperTrim,
    diamond,
    wedgeKeep,
    lowerEdge,
    cavity,
    hingeBump,
    hingeBumpTrim,
    extra,
  };
}

// ---------------------------------------------------------------- easy open

/** _pry_notch: an arc through the top of the front tab, flaring out at the front. */
function pryNotch(D: Dims, d: number): Prim[] {
  const yi = d / 2 - D.base_t - 0.5;
  const yc = d / 2 - D.notch_c;
  const L = D.notch_c + 1;
  const rise = L * (1 - D.notch_b / D.notch_c);
  const r = D.notch_r;
  const p = (y: number): V3 => [0, y, D.base_h - D.notch_h + r];
  return [
    { kind: "cone", p: p(yi), d: [0, 1, 0], h: yc - yi, r1: r, r2: r },
    { kind: "cone", p: p(yc), d: [0, 1, 0], h: L, r1: r, r2: r + L, s: [0, 0, rise] },
  ];
}

// ---------------------------------------------------------------- base & lid

const shapeOf = (q: Prim): Shape3D => {
  if (q.kind === "cone") {
    if (q.r1 === q.r2 && !q.s) return makeCylinder(q.r1, q.h, q.p, q.d);
    const s = q.s ?? [0, 0, 0];
    const end: V3 = [
      q.p[0] + q.d[0] * q.h + s[0],
      q.p[1] + q.d[1] * q.h + s[1],
      q.p[2] + q.d[2] * q.h + s[2],
    ];
    return loft(
      [assembleWire([makeCircle(q.r1, q.p, q.d)]), assembleWire([makeCircle(q.r2, end, q.d)])],
      { ruled: true },
    );
  }
  // OpenSCAD winds polyhedron faces clockwise seen from outside, and extruded
  // polygons come either way round, so orient each solid by its signed volume.
  const faces = signedVolume(q.pts, q.faces) < 0 ? q.faces.map((f) => [...f].reverse()) : q.faces;
  return makeSolid(faces.map((f) => makePolygon(f.map((i) => q.pts[i]))));
};

/** Signed volume of a closed polyhedron; positive when faces wind outwards. */
function signedVolume(pts: V3[], faces: number[][]): number {
  let v = 0;
  for (const f of faces)
    for (let k = 1; k + 1 < f.length; k++) {
      const [a, b, c] = [pts[f[0]], pts[f[k]], pts[f[k + 1]]];
      v +=
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  return v / 6;
}

/** Fuses prims into one solid (or null if there are none). Pairwise, in a
 * balanced tree: OpenCascade can't fuse against a compound whose pieces overlap
 * each other, and pairing keeps each boolean small. */
function solid(prims: Prim[]): Shape3D | null {
  let shapes = prims.map(shapeOf);
  if (shapes.length === 0) return null;
  while (shapes.length > 1) {
    const next: Shape3D[] = [];
    for (let i = 0; i < shapes.length; i += 2)
      next.push(i + 1 < shapes.length ? shapes[i].fuse(shapes[i + 1]) : shapes[i]);
    shapes = next;
  }
  return shapes[0];
}

/** Fuses solids pairwise, in a balanced tree (see solid()). */
function fuseAll(shapes: Shape3D[]): Shape3D | null {
  if (shapes.length === 0) return null;
  while (shapes.length > 1) {
    const next: Shape3D[] = [];
    for (let i = 0; i < shapes.length; i += 2)
      next.push(i + 1 < shapes.length ? shapes[i].fuse(shapes[i + 1]) : shapes[i]);
    shapes = next;
  }
  return shapes[0];
}

const fuse = (a: Shape3D, prims: Prim[]) => {
  const b = solid(prims);
  return b ? a.fuse(b) : a;
};
const cut = (a: Shape3D, prims: Prim[]) => {
  const b = solid(prims);
  return b ? a.cut(b) : a;
};

/** generate_base, in its own frame. */
function generateBase(D: Dims): Shape3D {
  const w = D.base_outer_d; // generate_base's base_d parameter
  const t = D.base_t;
  const sh = baseShell(D, D.base_w, w, D.base_lip_top_h, D.base_lip_bot_h, t);

  let s = solid(sh.add)!;
  s = cut(s, sh.cavity);
  s = fuse(s, sh.bump);
  s = cut(s, sh.slot);
  s = fuse(s, sh.extra);

  const cuts: Prim[] = [];
  if (D.front_snap)
    for (const x of D.snap_xs)
      cuts.push(
        ...T(
          [x, w / 2 - t, D.box_h - 3.5],
          prismoid([D.snap_w, D.snap_h - 0.2], [D.snap_w, 0.6], D.snap_catch, [0, 0], "back"),
        ),
      );
  cuts.push(
    ...T(
      [0, w / 2 - 1 / 2, D.label_h_loc],
      prismoid([D.label_w, D.label_h], [D.label_w, D.label_h + 1], 1, [0, -0.5], "back"),
    ),
  );
  if (D.footy)
    cuts.push(
      ...footPocket(-D.base_w / 2 + 5.8284 + 5, -w / 2 - 0.8),
      ...footPocket(D.base_w / 2 - 5.8284 - 5, -w / 2 - 0.8),
    );
  cuts.push(...T([-D.base_w / 2, -w / 2 - 0.5, D.box_h / 2 - 0.1], hinge(D, true, true)));
  if (D.pry) cuts.push(...pryNotch(D, w));
  s = cut(s, cuts);

  const adds: Prim[] = [...T([-D.base_w / 2, -w / 2 - 0.5, D.box_h / 2], hinge(D, true, false))];
  if (D.side_snaps)
    for (const sx of [-1, 1])
      adds.push(
        ...T(
          [sx * (D.base_w / 2 - 1.2), 0.5, D.side_snap_z],
          prismoid(
            [D.side_snap_zh, D.side_snap_l],
            [0.6, D.side_snap_l - 1],
            0.3 + D.side_snap_d,
            [0, 0],
            sx === 1 ? "right" : "left",
          ),
        ),
      );
  return fuse(s, adds);
}

/** generate_lid, in its own frame. */
function generateLid(D: Dims): Shape3D {
  const w = D.lid_outer_d;
  const h = D.lid_h;
  const sh = lidShell(D, D.lid_w, w, h, D.lid_lip_top_h, D.lid_side_t, D.lid_fb_t);

  // outer shell minus the upper trim and the corner wedge, plus the lower edge,
  // minus the cavity
  let s = solid(sh.outer)!;
  s = cut(s, sh.upperTrim);
  const wedge = cut(solid(sh.diamond)!, sh.wedgeKeep);
  s = s.cut(wedge);
  s = fuse(s, sh.lowerEdge);
  s = cut(s, sh.cavity);
  s = s.fuse(cut(solid(sh.hingeBump)!, sh.hingeBumpTrim));
  s = fuse(s, sh.extra);

  const cuts: Prim[] = [];
  if (D.footy)
    cuts.push(
      ...footPocket(-D.lid_w / 2 + 16.82843 + 5, -w / 2 - 0.8),
      ...footPocket(D.lid_w / 2 - 16.82843 - 5, -w / 2 - 0.8),
    );
  // generate_lid has no base_d parameter, so this is the global one (the box depth)
  cuts.push(...T([-D.base_w / 2, -D.base_d / 2 + 0.75, D.box_h / 2 - 0.1], hinge(D, false, true)));
  cuts.push(
    ...T(
      [0, w / 2 - D.lid_fb_t / 2 - 0.34999 + 1.25, h - 6],
      prismoid([D.box_w - 30.06, D.lid_fb_t], [D.box_w - 18.06, D.lid_fb_t], 6),
    ),
  );
  if (D.side_snaps)
    for (const sx of [-1, 1])
      cuts.push(
        ...T(
          [sx * (D.lid_w / 2 - 1), 0.5, 6.5],
          prismoid(
            [D.side_snap_zh + 0.2, D.side_snap_l + 1],
            [0.8, D.side_snap_l],
            0.1 + D.side_snap_c,
            [0, 0],
            sx === 1 ? "right" : "left",
          ),
        ),
      );
  s = cut(s, cuts);

  // hinge knuckles, each with a cone dimple at both ends
  const knuckles = cut(
    solid(T([-D.base_w / 2, -D.base_d / 2 + 0.75, D.box_h / 2], hinge(D, false, false)))!,
    T([-D.base_w / 2, -D.base_d / 2 + 0.75, D.box_h / 2], lidKnuckleDimples(D)),
  );
  s = s.fuse(knuckles);

  if (D.front_snap)
    for (const x of D.snap_xs) {
      let latch = solid(
        T(
          [x, w / 2 - 2.1, 3.5],
          prismoid([D.snap_w + 0.4, D.snap_h], [D.snap_w - 1.2, 0.6], D.snap_depth, [0, 0], "back"),
        ),
      )!;
      latch = cut(
        latch,
        [-1, 1].flatMap((sx) =>
          T(
            [
              x + sx * (D.snap_w / 2 + 0.5) - 0.5,
              w / 2 - 2.1 + 0.5 - 0.5,
              3.5 - (D.snap_h + 0.1) / 2,
            ],
            cube([1, 1, D.snap_h + 0.1]),
          ),
        ),
      );
      s = s.fuse(latch);
    }
  return s;
}

// ---------------------------------------------------------------- dividers

/** generate_row_divider: a wall along y at x = 0. */
function rowDivider(
  h: number,
  w: number,
  t: number,
  chamf: boolean,
  c: number,
  cf: boolean[],
): Prim[] {
  const out: Prim[] = R([0, 270, 0], T([0, 0, -t / 2], cube([h, w, t])));
  const tri = (dx: number, y: number, pg: V2[]) => T([dx, y, 0], linearExtrude(pg, h));
  if (cf[0])
    out.push(
      ...tri(-t / 2, 0, [
        [0, 0],
        [0, 2],
        [-2, 0],
      ]),
    );
  if (cf[1])
    out.push(
      ...tri(t / 2, 0, [
        [0, 0],
        [0, 2],
        [2, 0],
      ]),
    );
  if (cf[2])
    out.push(
      ...tri(-t / 2, w, [
        [0, 0],
        [0, -2],
        [-2, 0],
      ]),
    );
  if (cf[3])
    out.push(
      ...tri(t / 2, w, [
        [0, 0],
        [0, -2],
        [2, 0],
      ]),
    );
  if (chamf)
    for (const sx of [-1, 1])
      out.push(
        ...R(
          [270, 0, 0],
          linearExtrude(
            (
              [
                [0, 0],
                [0, -c],
                [sx * c, 0],
              ] as V2[]
            ).map(([x, y]): V2 => [x + (sx * t) / 2, y]),
            w,
          ),
        ),
      );
  return out;
}

/** generate_col_divider: a wall along x at y = 0. */
function colDivider(
  h: number,
  w: number,
  t: number,
  chamf: boolean,
  c: number,
  cf: boolean[],
): Prim[] {
  const out: Prim[] = R([0, 270, 270], T([0, 0, -t / 2], cube([h, w, t])));
  const tri = (x: number, dy: number, pg: V2[]) => T([x, dy, 0], linearExtrude(pg, h));
  if (cf[0])
    out.push(
      ...tri(0, -t / 2, [
        [0, 0],
        [2, 0],
        [0, -2],
      ]),
    );
  if (cf[1])
    out.push(
      ...tri(0, t / 2, [
        [0, 0],
        [2, 0],
        [0, 2],
      ]),
    );
  if (cf[2])
    out.push(
      ...tri(w, -t / 2, [
        [0, 0],
        [-2, 0],
        [0, -2],
      ]),
    );
  if (cf[3])
    out.push(
      ...tri(w, t / 2, [
        [0, 0],
        [-2, 0],
        [0, 2],
      ]),
    );
  if (chamf)
    for (const sy of [-1, 1])
      out.push(
        ...R(
          [0, 90, 0],
          linearExtrude(
            (
              [
                [0, 0],
                [0, sy * c],
                [-c, 0],
              ] as V2[]
            ).map(([x, y]): V2 => [x, y + (sy * t) / 2]),
            w,
          ),
        ),
      );
  return out;
}

/** generate_layout_dividers */
function layoutDividers(
  D: Dims,
  W: number,
  Dp: number,
  H: number,
  xf: number[],
  yf: number[],
  cells: number[],
  chamf: boolean,
): Prim[] {
  const C = xf.length - 1;
  const Rn = yf.length - 1;
  const xs = xf.map((f) => f * W);
  const ys = yf.map((f) => f * Dp);
  const vwall = (r: number, i: number) =>
    r >= 0 && r < Rn && i >= 1 && i <= C - 1 && cells[r * C + i - 1] !== cells[r * C + i];
  const hwall = (j: number, c: number) =>
    j >= 1 && j <= Rn - 1 && c >= 0 && c < C && cells[(j - 1) * C + c] !== cells[j * C + c];
  const out: Prim[] = [];
  for (let i = 1; i <= C - 1; i++)
    for (let r = 0; r <= Rn - 1; r++)
      if (vwall(r, i)) {
        const cf = [
          r === 0 || hwall(r, i - 1),
          r === 0 || hwall(r, i),
          r === Rn - 1 || hwall(r + 1, i - 1),
          r === Rn - 1 || hwall(r + 1, i),
        ];
        out.push(
          ...T(
            [xs[i], ys[r], 0],
            rowDivider(H, ys[r + 1] - ys[r], D.div_t, chamf, D.chamfer_size, cf),
          ),
        );
      }
  for (let j = 1; j <= Rn - 1; j++)
    for (let c = 0; c <= C - 1; c++)
      if (hwall(j, c)) {
        const cf = [
          c === 0 || vwall(j - 1, c),
          c === 0 || vwall(j, c),
          c === C - 1 || vwall(j - 1, c + 1),
          c === C - 1 || vwall(j, c + 1),
        ];
        out.push(
          ...T(
            [xs[c], ys[j], 0],
            colDivider(H, xs[c + 1] - xs[c], D.div_t, chamf, D.chamfer_size, cf),
          ),
        );
      }
  return out;
}

// ---------------------------------------------------------------- inserts

function inserts(D: Dims, origin: V3): Shape3D | null {
  if (D.fills.length === 0) return null;
  const C = D.xs.length - 1;
  const Rn = D.ys.length - 1;
  const W = D.box_internal_w;
  const Dp = D.box_internal_d;
  const colAt = (fx: number) => D.xs.slice(1, C).filter((x) => x <= fx).length;
  const rowAt = (fy: number) => D.ys.slice(1, Rn).filter((y) => y <= fy).length;
  const regionAt = (fx: number, fy: number) => D.cells[rowAt(fy) * C + colAt(fx)];
  const blocks: Prim[] = [];
  for (const f of D.fills) {
    const id = regionAt(f[0], f[1]);
    const h = Math.min(f[2], D.box_internal_h);
    for (let r = 0; r < Rn; r++)
      for (let c = 0; c < C; c++)
        if (D.cells[r * C + c] === id)
          blocks.push(
            ...T(
              [D.xs[c] * W, D.ys[r] * Dp, 0],
              cube([(D.xs[c + 1] - D.xs[c]) * W, (D.ys[r + 1] - D.ys[r]) * Dp, 0.1 + h]),
            ),
          );
  }
  return solid(T(origin, blocks))!.intersect(solid(T(origin, baseCavityInGrid(D, origin)))!);
}

/** _base_cavity_in_grid(). */
function baseCavityInGrid(D: Dims, origin: V3): Prim[] {
  return T(
    [-origin[0], -origin[1], -origin[2]],
    T(
      [0, D.base_outer_d / 2 + 0.5 + 0.5, 1.6 - 0.1],
      chamferedCuboid(
        D.base_w - 2 * D.base_t,
        D.base_outer_d - 2 * D.base_t - 1,
        D.base_lip_top_h,
        4.8284,
        3.8284,
      ),
    ),
  );
}

/** generate_scoops(), placed at the grid origin. */
function scoops(D: Dims, origin: V3): Shape3D | null {
  if (D.scoops.length === 0) return null;
  const pieces = D.scoops.map(([x0, x1, y, r]) =>
    solid(T([x0, y - r, 0], cube([x1 - x0, r, 0.1 + r])))!.cut(
      solid([
        { kind: "cone", p: [x0 - 1, y - r, 0.1 + r], d: [1, 0, 0], h: x1 - x0 + 2, r1: r, r2: r },
      ])!,
    ),
  );
  let s = pieces[0];
  for (const q of pieces.slice(1)) s = s.fuse(q);
  return s.intersect(solid(baseCavityInGrid(D, origin))!).translate(origin);
}

// ---------------------------------------------------------------- gridfinity

/** A ruled loft through rounded rectangles [w, d, r, z], centred on the z axis:
 * hull() of _gf_rounded() slices in the scad. */
function roundedLoft(sections: [number, number, number, number][]): Shape3D {
  const wires = sections.map(
    ([w, d, r, z]) => (drawRoundedRectangle(w, d, r).sketchOnPlane("XY", z) as Sketch).wire,
  );
  return loft(wires, { ruled: true });
}

/** _gf_pocket_outline(grow) */
function gfPocketOutline(D: Dims, grow = 0): V2[] {
  const [w, h, k] = [D.gf_pw / 2, D.gf_ph / 2, D.gf_pk];
  const pg: V2[] = [
    [-w + k, -h],
    [w - k, -h],
    [w, -h + k],
    [w, h - k],
    [w - k, h],
    [-w + k, h],
    [-w, h - k],
    [-w, -h + k],
  ];
  return grow ? offsetConvex(pg, grow) : pg;
}

/** _gf_pocket(): pocket, flare and recesses */
function gfPocket(D: Dims): Prim[] {
  const o = gfPocketOutline(D);
  const top = D.gf_h - D.gf_c;
  return [
    ...rings([o, o], [D.gf_floor, top + 0.5]),
    ...rings([o, gfPocketOutline(D, D.gf_c + 1)], [top, D.gf_h + 1]),
    ...D.gf_recesses.flatMap(([u0, u1, v0, v1]) =>
      T([u0, v0, D.gf_floor - D.gf_recess], cube([u1 - u0, v1 - v0, D.gf_recess + 0.5])),
    ),
  ];
}

/** _gf_magnet_hole(), at the origin. */
function gfMagnetHole(D: Dims): Shape3D {
  let hole = solid(T([0, 0, -1], cyl(1 + D.gf_mag_h, D.gf_mag_r)))!;
  if (D.gf_mag_ribs) {
    const rib = T(
      [D.gf_rib_r, -0.4, -1],
      cube([D.gf_mag_r + 0.2 - D.gf_rib_r, 0.8, 1 + D.gf_mag_h + 0.1]),
    );
    hole = cut(
      hole,
      [...Array(8).keys()].flatMap((k) => R([0, 0, k * 45], rib)),
    );
  }
  return fuse(hole, T([0, 0, -0.5], cyl(1, D.gf_mag_r + 1, D.gf_mag_r)));
}

/** generate_gridfinity(), centred on the origin. */
export function gridfinity(D: Dims): Shape3D | null {
  if (!D.gridfinity) return null;
  const cells: V2[] = [];
  for (let i = 0; i < D.gf_x; i++)
    for (let j = 0; j < D.gf_y; j++)
      cells.push([(i - (D.gf_x - 1) / 2) * 42, (j - (D.gf_y - 1) / 2) * 42]);

  const pieces = cells.map(([x, y]) =>
    roundedLoft([
      [35.6, 35.6, 0.8, 0],
      [37.2, 37.2, 1.6, 0.8],
      [37.2, 37.2, 1.6, 2.6],
      [41.5, 41.5, 3.75, 4.75],
    ]).translate([x, y, 0]),
  );
  const [w, d, r, c] = [D.gf_w, D.gf_d, D.gf_r, D.gf_c];
  pieces.push(
    roundedLoft([
      [w, d, r, 4.75],
      [w, d, r, D.gf_h - c],
      [w - 2 * c, d - 2 * c, r - c, D.gf_h],
    ]),
  );
  let s = fuseAll(pieces)!;

  const pocket = gfPocket(D);
  const cuts: Prim[] = D.gf_pockets.flatMap(([x, y]) =>
    T([x, y, 0], D.gf_turn ? R([0, 0, 90], pocket) : pocket),
  );
  s = cut(s, cuts);
  if (D.gf_magnets) {
    const holes: Shape3D[] = [];
    for (const [x, y] of cells)
      for (const dx of [-13, 13])
        for (const dy of [-13, 13]) holes.push(gfMagnetHole(D).translate([x + dx, y + dy, 0]));
    s = s.cut(fuseAll(holes)!);
  }
  return s;
}

// ---------------------------------------------------------------- assembly

/** mw_assembly_view(): every part, laid out for printing as the scad does. */
export function buildClamshell(D: Dims): Parts {
  if (D.tools > 0)
    throw new Error(
      "STEP export can't include pockets for imported tool meshes yet; use 3MF or STL for this one",
    );
  const base = generateBase(D).translate([0, D.base_outer_d / 2 + 0.5, 0]);
  const lid = generateLid(D)
    .rotate(180, [0, 0, 0], [0, 0, 1])
    .translate([0, -D.lid_outer_d / 2 - 0.5, 0]);

  const div: Prim[] = T(
    [-D.base_w / 2 + D.base_t, D.base_t + 1.5, D.shell_bottom_t - 0.1],
    layoutDividers(
      D,
      D.box_internal_w,
      D.box_internal_d,
      D.box_internal_h + 0.2,
      D.xs,
      D.ys,
      D.cells,
      D.bottom_chamfer,
    ),
  );
  if (D.lid_dividers)
    div.push(
      ...T(
        [-D.lid_w / 2 + D.lid_side_t, -D.lid_outer_d + 2.5, D.shell_bottom_t - 0.1],
        layoutDividers(
          D,
          D.box_internal_w,
          D.lid_internal_d,
          D.lid_internal_h + 0.1,
          D.xs,
          D.lid_ys,
          D.lid_cells,
          false,
        ),
      ),
    );
  const origin: V3 = [-D.base_w / 2 + D.base_t, D.base_t + 1.5, D.shell_bottom_t - 0.1];
  let dividers = solid(div);
  const sc = scoops(D, origin);
  if (sc) dividers = dividers ? dividers.fuse(sc) : sc;
  return {
    base,
    lid,
    dividers,
    inserts: inserts(D, origin),
    gridfinity: gridfinity(D)?.translate([D.gf_at, 0, 0]) ?? null,
  };
}
