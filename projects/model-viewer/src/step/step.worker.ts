// Builds the clamshell in OpenCascade and writes it as STEP, off the main
// thread. OpenCascade is a 22 MB WebAssembly module, so it only loads the first
// time someone asks for a STEP file.

import { exportSTEP, setOC } from "replicad";
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import { buildClamshell, type Dims, gridfinity, type Parts } from "./clamshell";

export interface StepRequest {
  id: number;
  dims: Dims;
  /** just the Gridfinity bin, at the origin */
  binOnly?: boolean;
}

export type StepResult =
  | { id: number; ok: true; bytes: ArrayBuffer }
  | { id: number; ok: false; error: string };

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  ready ??= opencascade({ locateFile: () => wasmUrl }).then((oc) => setOC(oc));
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

self.onmessage = async (e: MessageEvent<StepRequest>) => {
  const { id, dims, binOnly } = e.data;
  try {
    await init();
    const shapes = binOnly ? binShapes(dims) : stepShapes(buildClamshell(dims), dims);
    const bytes = await exportSTEP(shapes, { unit: "MM", modelUnit: "MM" }).arrayBuffer();
    for (const s of shapes) s.shape.delete();
    self.postMessage({ id, ok: true, bytes } satisfies StepResult, { transfer: [bytes] });
  } catch (err) {
    const error =
      err instanceof Error
        ? err.message
        : err instanceof WebAssembly.Exception
          ? "OpenCascade could not build this shape"
          : String(err);
    self.postMessage({ id, ok: false, error } satisfies StepResult);
  }
};

/** Just the Gridfinity bin, at the origin. */
function binShapes(dims: Dims) {
  const bin = gridfinity(dims);
  if (!bin) throw new Error("the Gridfinity bin is turned off");
  return [{ shape: bin, name: "gridfinity", color: "#ffffff" }];
}

/** Every part, laid out as the scad does. */
function stepShapes(parts: Parts, dims: Dims) {
  return [
    { shape: parts.base, name: "base", color: "#ffffff" },
    { shape: parts.lid, name: "lid", color: "#ffffff" },
    ...(parts.dividers
      ? [{ shape: parts.dividers, name: "dividers", color: dims.divider_color }]
      : []),
    ...(parts.inserts ? [{ shape: parts.inserts, name: "inserts", color: dims.insert_color }] : []),
    ...(parts.gridfinity
      ? [{ shape: parts.gridfinity, name: "gridfinity", color: "#ffffff" }]
      : []),
  ];
}
