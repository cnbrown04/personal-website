import init, { decode_mesh, decode_model_file, type MeshData } from "../wasm/pkg/model_viewer.js";
import type { ToolMesh } from "./layout/inserts";

let ready: Promise<void> | null = null;

/** The wasm module is loaded once and reused for every render. */
export function initMesh(): Promise<void> {
  if (!ready) ready = init().then(() => undefined);
  return ready;
}

export interface DecodedMesh {
  data: MeshData;
  decodeMs: number;
}

/**
 * Decode an MVM buffer (merged render parts) into three.js-ready attributes. Normal smoothing,
 * color expansion and mass properties all happen in Rust/wasm.
 */
/** Decode an uploaded STL/3MF for previewing it as a tool ghost. */
export async function decodeToolMesh(buffer: ArrayBuffer, name: string): Promise<ToolMesh> {
  await initMesh();
  const data = decode_model_file(new Uint8Array(buffer), 30);
  return { name, positions: data.positions, normals: data.normals };
}

export async function decodeMesh(buffer: ArrayBuffer, creaseDegrees = 25): Promise<DecodedMesh> {
  await initMesh();
  const started = performance.now();
  const data = decode_mesh(new Uint8Array(buffer), creaseDegrees);
  return { data, decodeMs: performance.now() - started };
}
