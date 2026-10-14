import { useCallback, useEffect, useRef, useState } from "react";
import init, { dither } from "../wasm/pkg/dither.js";
import { methods, paletteBytes, palettes } from "./palettes";
import { sampleImage } from "./sample";

type Source = HTMLCanvasElement | ImageBitmap;
const MAX_WIDTH = 1200;

const fieldClass =
  "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const buttonClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted";

export default function Dither() {
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [method, setMethod] = useState<string>("atkinson");
  const [paletteId, setPaletteId] = useState("1bit");
  const [scale, setScale] = useState(2);
  const [strength, setStrength] = useState(1);
  const [stats, setStats] = useState<{ w: number; h: number; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const output = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init().then(() => setReady(true));
    setSource(sampleImage());
  }, []);

  const loadFile = useCallback(async (file: File | undefined | null) => {
    if (!file?.type.startsWith("image/")) return;
    try {
      setSource(await createImageBitmap(file));
      setError(null);
    } catch {
      setError("Couldn't read that image.");
    }
  }, []);

  // Paste an image from anywhere on the page.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) loadFile(item.getAsFile());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => {
    if (!ready || !source || !output.current || !original.current) return;
    const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

    const w = Math.max(1, Math.floor(Math.min(source.width, MAX_WIDTH) / scale));
    const h = Math.max(1, Math.round((source.height * w) / source.width));

    const orig = original.current;
    orig.width = w;
    orig.height = h;
    const octx = orig.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(source, 0, 0, w, h);
    const input = octx.getImageData(0, 0, w, h);

    try {
      const start = performance.now();
      const result = dither(
        new Uint8Array(input.data.buffer),
        w,
        h,
        method,
        paletteBytes(palette),
        strength,
      );
      const ms = performance.now() - start;

      const out = output.current;
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d") as CanvasRenderingContext2D;
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(result.buffer as ArrayBuffer, result.byteOffset, result.length),
          w,
          h,
        ),
        0,
        0,
      );
      setStats({ w, h, ms });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ready, source, method, paletteId, scale, strength]);

  function download() {
    const out = output.current;
    if (!out) return;
    // Upscale with nearest-neighbor so each dithered pixel stays a crisp block.
    const big = document.createElement("canvas");
    big.width = out.width * scale;
    big.height = out.height * scale;
    const ctx = big.getContext("2d") as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(out, 0, 0, big.width, big.height);
    big.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dithered-${method}-${paletteId}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  }

  const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Algorithm</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={fieldClass}>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Palette</span>
          <select
            value={paletteId}
            onChange={(e) => setPaletteId(e.target.value)}
            className={fieldClass}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Pixel size · {scale}×</span>
          <input
            type="range"
            min={1}
            max={8}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="block w-full accent-primary"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Strength · {strength.toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="block w-full accent-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()}>
          Open image
        </button>
        <button type="button" className={buttonClass} onClick={() => setSource(sampleImage())}>
          Sample
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!stats}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Download PNG
        </button>
        <span className="flex gap-1" aria-hidden>
          {palette.colors.map((c) => (
            <span
              key={c}
              className="size-4 rounded-sm border border-border"
              style={{ background: c }}
            />
          ))}
        </span>
        {stats && (
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            {stats.w}×{stats.h} · {stats.ms.toFixed(1)} ms in WASM
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => loadFile(e.target.files?.[0])}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target and hold-to-compare are enhancements; buttons above cover the same actions */}
      <div
        className={`relative overflow-hidden rounded-lg border bg-background ${dragging ? "border-primary" : "border-border"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          loadFile(e.dataTransfer.files[0]);
        }}
        onPointerDown={() => setComparing(true)}
        onPointerUp={() => setComparing(false)}
        onPointerLeave={() => setComparing(false)}
      >
        <canvas
          ref={output}
          className="block h-auto w-full select-none"
          style={{ imageRendering: "pixelated" }}
        />
        <canvas
          ref={original}
          className={`absolute inset-0 block h-full w-full select-none ${comparing ? "" : "invisible"}`}
        />
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
          {comparing ? "Original" : "Hold to compare · drop or paste an image"}
        </span>
      </div>
    </div>
  );
}
