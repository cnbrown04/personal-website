// A pool of Web Workers running OpenSCAD on the visitor's CPU cores. The
// 11 MB module is compiled once here and shared with every worker.
import wasmUrl from "../../vendor/openscad/openscad.wasm?url";
import type { RunRequest, RunResult } from "./openscad.worker";

const TIMEOUT_MS = 120_000;

interface Job {
  request: Omit<RunRequest, "type" | "id">;
  signal?: AbortSignal;
  resolve: (r: RunResult) => void;
  reject: (e: unknown) => void;
}

interface Slot {
  worker: Worker;
  busy: boolean;
}

export const poolSize = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

let compiled: Promise<WebAssembly.Module> | null = null;
const slots: Slot[] = [];
const queue: Job[] = [];
let nextId = 1;

function compile(): Promise<WebAssembly.Module> {
  compiled ??= (async () => {
    const res = await fetch(wasmUrl);
    if (!res.ok) throw new Error(`could not load OpenSCAD (${res.status})`);
    // compileStreaming needs the application/wasm MIME type; fall back if a host omits it.
    return res.headers.get("content-type")?.includes("application/wasm")
      ? WebAssembly.compileStreaming(res)
      : WebAssembly.compile(await res.arrayBuffer());
  })();
  compiled.catch(() => {
    compiled = null;
  });
  return compiled;
}

function spawn(module: WebAssembly.Module): Slot {
  const worker = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module" });
  worker.postMessage({ type: "init", module });
  return { worker, busy: false };
}

async function pump() {
  const module = await compile();
  while (slots.length < poolSize) slots.push(spawn(module));

  for (const slot of slots) {
    if (slot.busy) continue;
    let job = queue.shift();
    // Drop work nobody is waiting for anymore (e.g. superseded slider drags).
    while (job?.signal?.aborted) {
      job.reject(new DOMException("render superseded", "AbortError"));
      job = queue.shift();
    }
    if (!job) return;
    run(slot, job, module);
  }
}

function run(slot: Slot, job: Job, module: WebAssembly.Module) {
  slot.busy = true;
  const id = nextId++;
  const finish = () => {
    clearTimeout(timer);
    slot.worker.removeEventListener("message", onMessage);
    slot.busy = false;
    void pump();
  };
  const onMessage = (e: MessageEvent<RunResult>) => {
    if (e.data.id !== id) return;
    finish();
    job.resolve(e.data);
  };
  // A runaway render can't be interrupted inside wasm; replace the worker.
  const timer = setTimeout(() => {
    slot.worker.terminate();
    Object.assign(slot, spawn(module));
    finish();
    job.reject(new Error(`render timed out after ${TIMEOUT_MS / 1000}s`));
  }, TIMEOUT_MS);
  slot.worker.addEventListener("message", onMessage);
  slot.worker.postMessage({ type: "run", id, ...job.request } satisfies RunRequest);
}

/** Runs OpenSCAD once. Resolves with the exit code, output bytes and log. */
export function runOpenSCAD(request: Job["request"], signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    queue.push({ request, signal, resolve, reject });
    pump().catch(reject);
  });
}

/** Starts compiling OpenSCAD early, so the first render doesn't wait for it. */
export function preloadOpenSCAD() {
  void compile().catch(() => {});
}
