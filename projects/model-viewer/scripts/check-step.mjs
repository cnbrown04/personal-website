// Checks that the OpenCascade rebuild used for STEP export (src/step/clamshell.ts)
// matches model/clamshell.scad. For a spread of settings, each part must agree
// with OpenSCAD's render on volume, bounding box, centre of mass and inertia
// about six axes, which together pin down where material is, so a feature that
// is missing, extra or in the wrong place fails. The scad's cylinders have 32
// sides and the STEP ones are round, so there is a small tolerance.
//
//   node scripts/check-step.mjs            (or: mise run check:step)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getOC, makeAx1, setOC } from "replicad";
import opencascade from "replicad-opencascadejs";
import { buildClamshell, parseDims } from "../src/step/clamshell.ts";

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, "..");
const require = createRequire(import.meta.url);

// About 3x the differences that remain from rendering the scad with 256-sided
// circles, where the STEP has true ones.
const VOLUME_TOLERANCE = 0.00003; // relative
const BBOX_TOLERANCE = 0.01; // mm
const CENTROID_TOLERANCE = 0.0006; // mm
const INERTIA_TOLERANCE = 0.00005; // relative
// inertia is checked about axes through the centre of mass along these
const AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [Math.SQRT1_2, Math.SQRT1_2, 0],
  [0, Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, 0, Math.SQRT1_2],
];

/** Moment of inertia about an axis through c along d, from volume integrals
 * m = ∫1, s[i] = ∫x_i, q[i][j] = ∫x_i x_j. */
function inertiaAbout(m, s, q, d) {
  const c = s.map((v) => v / m);
  // central second moments
  const qc = q.map((row, i) => row.map((v, j) => v - m * c[i] * c[j]));
  const trace = qc[0][0] + qc[1][1] + qc[2][2];
  let dqd = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dqd += d[i] * qc[i][j] * d[j];
  return trace - dqd;
}

const CASES = {
  default: {},
  "pry notch with split front snap, scoops, 2x2 with fills": {
    finger_scoops: true,
    pry_notch: true,
    col_splits: [0.5],
    row_splits: [0.5],
    cells: [0, 1, 2, 3],
    fills: [[0.75, 0.75, 6]],
  },
  "wide, pry notch without front snap": {
    front_snap: false,
    pry_notch: true,
    width: 140,
    depth: 90,
    height: 40,
  },
  "side snaps, chamfered dividers, small": {
    side_snaps: true,
    bottom_chamfer: true,
    width: 40,
    depth: 40,
    height: 17,
    snap_fit: "wide loose",
  },
  "gridfinity bin, default box": { gridfinity: true },
  "gridfinity bin turned, press-fit magnets, shallow box with grips in the pockets": {
    gridfinity: true,
    gridfinity_x: 3,
    gridfinity_y: 2,
    gridfinity_depth: 20,
    gridfinity_floor: 7.5,
    gridfinity_magnets: true,
    width: 70,
    depth: 40,
    height: 30,
  },
  "gridfinity bin, no feet, small, glued 5 x 3 magnets": {
    gridfinity: true,
    footy: false,
    gridfinity_x: 2,
    gridfinity_y: 1,
    gridfinity_magnets: true,
    gridfinity_magnet_fit: "glue",
    gridfinity_magnet_d: 5,
    gridfinity_magnet_h: 3,
    width: 35,
    height: 17,
  },
  "no feet, no lid dividers, merged cells, scoops": {
    footy: false,
    lid_dividers: false,
    finger_scoops: true,
    cells: [0, 0, 1, 2, 2, 1, 3, 3, 3],
  },
};

// ---- OpenSCAD (the same wasm build the site uses)
const scadSource = readFileSync(join(project, "model/clamshell.scad"), "utf8");
const scadWasm = await WebAssembly.compile(
  readFileSync(join(project, "vendor/openscad/openscad.wasm")),
);
const { default: OpenSCAD } = await import(join(project, "vendor/openscad/openscad.js"));

const define = (k, v) => ["-D", `${k}=${JSON.stringify(v)}`];

async function openscad(params, part, format) {
  const log = [];
  const inst = await OpenSCAD({
    noInitialRun: true,
    print: (t) => log.push(t),
    printErr: (t) => log.push(t),
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(scadWasm, imports).then((i) => done(i, scadWasm));
      return {};
    },
  });
  inst.FS.writeFile("/m.scad", scadSource);
  // Fine circles, so the scad's polygons are close to the STEP's true circles.
  const args = Object.entries({ ...params, mv_part: part, $fn: 256 }).flatMap(([k, v]) =>
    define(k, v),
  );
  inst.callMain([
    "/m.scad",
    "-o",
    `/o.${format}`,
    "--export-format",
    format,
    "--backend=manifold",
    ...args,
  ]);
  let bytes = null;
  try {
    bytes = inst.FS.readFile(`/o.${format}`);
  } catch {}
  return { log: log.join("\n"), bytes };
}

/** Volume and bounds of a binary STL. */
function stlStats(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  let vol = 0;
  const s = [0, 0, 0];
  const q = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const p = [0, 1, 2].map((k) => [0, 1, 2].map((j) => dv.getFloat32(o + k * 12 + j * 4, true)));
    for (const q of p)
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], q[j]);
        max[j] = Math.max(max[j], q[j]);
      }
    // signed tetrahedron (origin, a, b, c)
    const [a, b, c] = p;
    const det =
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0]);
    vol += det / 6;
    const sum = [0, 1, 2].map((i) => a[i] + b[i] + c[i]);
    for (let i = 0; i < 3; i++) {
      s[i] += (det / 24) * sum[i];
      for (let j = 0; j < 3; j++)
        q[i][j] += (det / 120) * (a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + sum[i] * sum[j]);
    }
  }
  const centroid = s.map((v) => v / vol);
  return {
    vol,
    bounds: [min, max],
    centroid,
    inertia: AXES.map((d) => inertiaAbout(vol, s, q, d)),
  };
}

/** The same numbers for an OpenCascade solid, from its exact geometry. */
function shapeStats(shape) {
  const oc = getOC();
  const props = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(shape.wrapped, props, false, false, false);
  const g = props.CentreOfMass();
  const centroid = [g.X(), g.Y(), g.Z()];
  const inertia = AXES.map((d) => props.MomentOfInertia(makeAx1(centroid, d)));
  const vol = props.Mass();
  props.delete();
  return { vol, bounds: shape.boundingBox.bounds, centroid, inertia };
}

// ---- OpenCascade
const oc = await opencascade({
  locateFile: () => require.resolve("replicad-opencascadejs/wasm"),
});
setOC(oc);

let failures = 0;
for (const [name, params] of Object.entries(CASES)) {
  const dims = parseDims((await openscad(params, "dims", "binstl")).log);
  const started = Date.now();
  const parts = buildClamshell(dims);
  const built = Date.now() - started;
  const rows = [];
  for (const part of ["base", "lid", "dividers", "inserts", "gridfinity"]) {
    const ref = await openscad(params, part, "binstl");
    const shape = parts[part];
    if (!ref.bytes || ref.bytes.length <= 84) {
      if (shape) {
        rows.push(`  ✗ ${part}: OpenSCAD made nothing, STEP made a solid`);
        failures++;
      }
      continue;
    }
    if (!shape) {
      rows.push(`  ✗ ${part}: missing from STEP`);
      failures++;
      continue;
    }
    const want = stlStats(ref.bytes);
    const got = shapeStats(shape);
    const dVol = Math.abs(got.vol - want.vol) / want.vol;
    const dBox = Math.max(
      ...[0, 1].flatMap((k) =>
        [0, 1, 2].map((j) => Math.abs(got.bounds[k][j] - want.bounds[k][j])),
      ),
    );
    const dCen = Math.hypot(...got.centroid.map((v, i) => v - want.centroid[i]));
    const dIn = Math.max(
      ...got.inertia.map((v, i) => Math.abs(v - want.inertia[i]) / want.inertia[i]),
    );
    const ok =
      dVol <= VOLUME_TOLERANCE &&
      dBox <= BBOX_TOLERANCE &&
      dCen <= CENTROID_TOLERANCE &&
      dIn <= INERTIA_TOLERANCE;
    if (!ok) failures++;
    rows.push(
      `  ${ok ? "✓" : "✗"} ${part.padEnd(8)} volume ${(dVol * 100).toFixed(4)}%  bounds ${dBox.toFixed(3)} mm  centre ${dCen.toFixed(5)} mm  inertia ${(dIn * 100).toFixed(4)}%`,
    );
  }
  console.log(`${name} (built in ${built} ms)\n${rows.join("\n")}`);
}
if (failures) {
  console.error(`\n${failures} part(s) differ between the scad and the STEP rebuild`);
  process.exit(1);
}
console.log("\nSTEP rebuild matches the scad");
