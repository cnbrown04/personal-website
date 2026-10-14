// Writes .br and .gz next to every compressible file in dist/, so the server
// sends precompressed bytes instead of compressing large assets (like the
// 11 MB OpenSCAD wasm) on every request.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { root } from "./lib.mjs";

const COMPRESSIBLE = new Set([
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".wasm",
  ".svg",
  ".json",
  ".txt",
  ".webmanifest",
]);
const MIN_BYTES = 1024;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

let saved = 0;
for (const path of files(join(root, "dist"))) {
  if (!COMPRESSIBLE.has(extname(path)) || statSync(path).size < MIN_BYTES) continue;
  const data = readFileSync(path);
  const br = brotliCompressSync(data, {
    params: {
      // Max quality is slow on multi-megabyte files for little gain.
      [constants.BROTLI_PARAM_QUALITY]: data.length > 2_000_000 ? 9 : 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  });
  const gz = gzipSync(data, { level: 9 });
  if (br.length < data.length) writeFileSync(`${path}.br`, br);
  if (gz.length < data.length) writeFileSync(`${path}.gz`, gz);
  saved += data.length - Math.min(br.length, data.length);
}
console.log(`precompressed dist/ (brotli saves ${(saved / 1e6).toFixed(1)} MB)`);
