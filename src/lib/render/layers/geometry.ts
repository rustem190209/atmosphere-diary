// Слой геометрии «по Кандинскому»: круги, кольца, линии, треугольники пульсируют на бит.
import { FRAME, H, W, type Scene } from "../types";

export function drawGeometryLayer(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  t: number,
  beat: number,
) {
  const wg = s.style.weights.geometry;
  if (wg < 0.06) return;
  const { angularity } = s.style.shapes;

  // Жёсткая сетка для напряжённых дней
  if (angularity > 0.55) {
    ctx.save();
    ctx.strokeStyle = s.ink;
    ctx.globalAlpha = 0.08 + 0.12 * wg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 1; k < 8; k++) {
      const x = (W / 8) * k;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let k = 1; k < 14; k++) {
      const y = (H / 14) * k;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  const visible = Math.round(s.shapes.length * Math.min(1, 0.25 + wg * 1.2));
  for (let k = 0; k < visible; k++) {
    const sh = s.shapes[k];
    const pulse = 1 + 0.14 * beat * (0.5 + sh.phase);
    const size = sh.size * pulse;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(sh.rot + t * sh.spin);
    ctx.globalAlpha = Math.min(0.9, 0.3 + wg * 0.8);
    // Фигуры поверх фото смешиваются мягче, чтобы не закрывать снимок
    const overPhoto =
      sh.x > FRAME.x &&
      sh.x < FRAME.x + FRAME.w &&
      sh.y > FRAME.y &&
      sh.y < FRAME.y + FRAME.h;
    if (overPhoto)
      ctx.globalCompositeOperation = s.dark ? "screen" : "multiply";
    ctx.fillStyle = sh.color;
    ctx.strokeStyle = sh.color;
    ctx.lineWidth = Math.max(3, size * 0.06);
    ctx.beginPath();
    switch (sh.kind) {
      case "circle":
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        break;
      case "ring":
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.moveTo(size * 0.3, 0);
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        break;
      case "half":
        ctx.arc(0, 0, size / 2, 0, Math.PI);
        ctx.closePath();
        break;
      case "triangle":
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size * 0.45, size * 0.4);
        ctx.lineTo(-size * 0.45, size * 0.4);
        ctx.closePath();
        break;
      case "line":
        ctx.lineWidth = Math.max(2, size * 0.02);
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        break;
    }
    if (sh.kind !== "line" && sh.fill) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }
}
