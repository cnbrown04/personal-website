// Runs one OpenSCAD render per message, each in a fresh instance of the
// precompiled module (OpenSCAD's main() is meant to run once per process).
import OpenSCAD from "../../vendor/openscad/openscad.js";

export interface RunRequest {
  type: "run";
  id: number;
  source: string;
  args: string[];
  /** Extra files next to the model, e.g. `uploads/<hash>.stl`. */
  files: [string, Uint8Array][];
  format: string;
  extension: string;
}

export interface RunResult {
  type: "done";
  id: number;
  code: number;
  bytes: Uint8Array | null;
  log: string[];
  ms: number;
  error?: string;
}

let module: WebAssembly.Module | null = null;

self.onmessage = async (
  e: MessageEvent<{ type: "init"; module: WebAssembly.Module } | RunRequest>,
) => {
  const msg = e.data;
  if (msg.type === "init") {
    module = msg.module;
    return;
  }

  const log: string[] = [];
  const reply = (r: Omit<RunResult, "type" | "id" | "log">) =>
    self.postMessage({ type: "done", id: msg.id, log, ...r } satisfies RunResult, {
      transfer: r.bytes ? [r.bytes.buffer] : [],
    });

  try {
    if (!module) throw new Error("OpenSCAD worker used before init");
    const wasm = module;
    const scad = await OpenSCAD({
      noInitialRun: true,
      print: (t) => log.push(t),
      printErr: (t) => log.push(t),
      instantiateWasm: (imports, done) => {
        WebAssembly.instantiate(wasm, imports).then((instance) => done(instance, wasm));
        return {};
      },
    });
    scad.FS.mkdir("/work");
    scad.FS.mkdir("/work/uploads");
    scad.FS.writeFile("/work/model.scad", msg.source);
    for (const [path, data] of msg.files) scad.FS.writeFile(`/work/${path}`, data);

    const out = `/work/out.${msg.extension}`;
    const started = performance.now();
    const code = scad.callMain([
      "/work/model.scad",
      "-o",
      out,
      "--export-format",
      msg.format,
      "--backend=manifold",
      ...msg.args,
    ]);
    const ms = performance.now() - started;
    let bytes: Uint8Array | null = null;
    try {
      bytes = scad.FS.readFile(out);
    } catch {
      // No output file: the log says why.
    }
    reply({ code, bytes, ms });
  } catch (err) {
    reply({
      code: -1,
      bytes: null,
      ms: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
