export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export const palettes: Palette[] = [
  { id: "1bit", name: "1-bit", colors: ["#000000", "#ffffff"] },
  { id: "gray4", name: "4 grays", colors: ["#000000", "#555555", "#aaaaaa", "#ffffff"] },
  { id: "gameboy", name: "Game Boy", colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
  { id: "cga", name: "CGA", colors: ["#000000", "#55ffff", "#ff55ff", "#ffffff"] },
  { id: "ink", name: "Ink & paper", colors: ["#1b1a2e", "#f2e8d5"] },
  {
    id: "pico8",
    name: "PICO-8",
    colors: [
      "#000000",
      "#1d2b53",
      "#7e2553",
      "#008751",
      "#ab5236",
      "#5f574f",
      "#c2c3c7",
      "#fff1e8",
      "#ff004d",
      "#ffa300",
      "#ffec27",
      "#00e436",
      "#29adff",
      "#83769c",
      "#ff77a8",
      "#ffccaa",
    ],
  },
];

/** Flat RGB bytes, the format the WASM `dither` function takes. */
export function paletteBytes(palette: Palette): Uint8Array {
  return Uint8Array.from(
    palette.colors.flatMap((hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))),
  );
}

export const methods = [
  { id: "floyd-steinberg", name: "Floyd–Steinberg" },
  { id: "atkinson", name: "Atkinson" },
  { id: "jarvis", name: "Jarvis–Judice–Ninke" },
  { id: "sierra-lite", name: "Sierra Lite" },
  { id: "bayer-2", name: "Bayer 2×2" },
  { id: "bayer-4", name: "Bayer 4×4" },
  { id: "bayer-8", name: "Bayer 8×8" },
  { id: "threshold", name: "Threshold (none)" },
] as const;
