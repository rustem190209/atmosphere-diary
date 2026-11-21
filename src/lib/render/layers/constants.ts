// Постоянные элементы (одинаковы во всех днях): рамка, дата, название, подпись, финальный кадр.
import { FRAME, H, MARGIN, W, type Scene } from "../types";
import { withAlpha } from "../../color";

// Разбить текст на строки по ширине
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // letterSpacing есть не во всех браузерах — проверяем
  if ("letterSpacing" in ctx)
    (
      ctx as CanvasRenderingContext2D & { letterSpacing: string }
    ).letterSpacing = `${px}px`;
}

const fontWeight = (w: number) =>
  Math.min(700, Math.max(300, Math.round(w / 100) * 100));

function drawTitle(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  y: number,
  size: number,
  align: CanvasTextAlign,
) {
  ctx.font = `${fontWeight(s.style.typography.weight)} ${size}px ${s.fonts.serif}`;
  setSpacing(ctx, s.style.typography.tracking * size * 0.5);
  ctx.textAlign = align;
  const lines = wrap(ctx, s.title, W - MARGIN * 2).slice(0, 3);
  const x = align === "center" ? W / 2 : MARGIN;
  lines.forEach((l, k) => ctx.fillText(l, x, y + k * size * 1.05));
  setSpacing(ctx, 0);
  return lines.length;
}

export function drawConstants(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  t: number,
) {
  const dur = s.style.timeline.duration;
  ctx.fillStyle = s.ink;
  ctx.textBaseline = "alphabetic";

  // Рамка фото
  ctx.strokeStyle = withAlpha(s.ink, 0.55);
  ctx.lineWidth = 2;
  ctx.strokeRect(FRAME.x - 10, FRAME.y - 10, FRAME.w + 20, FRAME.h + 20);

  // Дата — вверху слева
  ctx.font = `500 30px ${s.fonts.sans}`;
  setSpacing(ctx, 6);
  ctx.textAlign = "left";
  ctx.fillText(s.dateLabel.toUpperCase(), MARGIN, 140);
  ctx.textAlign = "right";
  ctx.fillText("ДНЕВНИК АТМОСФЕРЫ", W - MARGIN, 140);
  setSpacing(ctx, 0);

  // Название — под фото
  drawTitle(ctx, s, FRAME.y + FRAME.h + 120, 78, "left");

  // Подпись — внизу справа, рукописным шрифтом
  ctx.font = `56px ${s.fonts.hand}`;
  ctx.textAlign = "right";
  ctx.fillText(s.mood.atmosphere, W - MARGIN, H - 90);

  // Финальный кадр: последние 2 секунды — название, дата и подпись
  const fin = Math.min(1, Math.max(0, (t - (dur - 2)) / 0.8));
  if (fin > 0) {
    ctx.save();
    ctx.globalAlpha = fin * 0.94;
    ctx.fillStyle = s.bg[s.dark ? 1 : 0];
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fin;
    ctx.fillStyle = s.ink;
    const n = drawTitle(ctx, s, H * 0.42, 96, "center");
    ctx.font = `500 30px ${s.fonts.sans}`;
    setSpacing(ctx, 6);
    ctx.fillText(s.dateLabel.toUpperCase(), W / 2, H * 0.42 + n * 100 + 50);
    setSpacing(ctx, 0);
    ctx.font = `64px ${s.fonts.hand}`;
    ctx.fillText(s.mood.atmosphere, W / 2, H * 0.42 + n * 100 + 160);
    ctx.restore();
  }
}
