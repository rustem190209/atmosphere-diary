// Слой фона: градиент из палитры дня + текстура бумаги.
import { H, W, type Scene } from "../types";

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  t: number,
) {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, s.bg[0]);
  g.addColorStop(1, s.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Бумага: лёгкая фактура, медленно «дышит»
  ctx.save();
  ctx.globalAlpha = s.dark ? 0.05 : 0.09;
  ctx.globalCompositeOperation = s.dark ? "screen" : "multiply";
  const off = (t * 3) % 64;
  ctx.drawImage(s.paper, -off, -off, W + 128, H + 128);
  ctx.restore();
}
