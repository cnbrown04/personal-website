/** A procedurally drawn scene with smooth gradients, which show dithering off well. */
export function sampleImage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const sky = ctx.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, "#0f172a");
  sky.addColorStop(0.55, "#7c3aed");
  sky.addColorStop(1, "#f59e0b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 640);

  const shadow = ctx.createRadialGradient(470, 560, 10, 470, 560, 260);
  shadow.addColorStop(0, "rgba(0,0,0,0.55)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 380, 960, 260);

  sphere(ctx, 450, 330, 200, "#e0e7ff", "#6366f1", "#0b0820");
  sphere(ctx, 760, 430, 90, "#fff7ed", "#f97316", "#2a0a02");
  sphere(ctx, 180, 470, 60, "#ecfeff", "#06b6d4", "#021b20");
  return canvas;
}

function sphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  light: string,
  mid: string,
  dark: string,
) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
