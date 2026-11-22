// Слой фото: «виртуальный оператор» (virtualCamera.ts) внутри постоянной рамки 4:5.
// Из одного фото — несколько планов (общий → средний → деталь), параллакс фона и объекта,
// смены кадров на долю такта, «удары» камеры на бит и на пики пульса.
// Поверх — мазки «по Моне» и двойная экспозиция (если текст и опрос расходятся).
// Честно: это имитация глубины, карта глубины не считается.
import { FRAME, type FrameInput, type Scene, type Stroke } from "../types";
import { clamp } from "../../schema";
import { drawTimeline, shotAt } from "../virtualCamera";

function matteInset(s: Scene) {
  return Math.round(s.style.negativeSpace * 150);
}

// Мазки поверх кадра: проявляются по ходу плана и слегка «плывут» вместе с камерой
function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  paint: number,
  reveal: number,
  curvature: number,
  drift: number,
) {
  if (paint < 0.08) return;
  ctx.lineCap = "round";
  const alpha = clamp(0.2 + paint * 0.55);
  for (const st of strokes) {
    if (st.order > reveal) continue;
    const px = st.u * w + drift * (st.v - 0.5) * 30,
      py = st.v * h;
    const dx = (Math.cos(st.angle) * st.len) / 2,
      dy = (Math.sin(st.angle) * st.len) / 2;
    const bx = -dy * st.bend * curvature,
      by = dx * st.bend * curvature;
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = alpha * clamp((reveal - st.order) * 6);
    ctx.lineWidth = st.width;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.quadraticCurveTo(px + bx, py + by, px + dx, py + dy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawPhotoLayer(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  f: FrameInput,
) {
  if (!s.prepared.length || !s.shots.length) return;
  const inset = matteInset(s);
  const rect = {
    x: FRAME.x + inset,
    y: FRAME.y + inset,
    w: FRAME.w - inset * 2,
    h: FRAME.h - inset * 2,
  };
  const { grade, weights, timeline } = s.style;

  // Паспарту: подложка рамки, на ней фото с воздухом вокруг
  if (inset > 0) {
    ctx.fillStyle = s.dark
      ? "rgba(255,255,255,0.04)"
      : "rgba(255,255,255,0.35)";
    ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(rect.x, rect.y);

  // Цветокоррекция дня (в Safari фильтры холста могут не работать — тогда фото без коррекции)
  const filters = [
    `saturate(${grade.saturation.toFixed(2)})`,
    `contrast(${grade.contrast.toFixed(2)})`,
    `hue-rotate(${grade.hueShift.toFixed(1)}deg)`,
  ];
  if (weights.film > 0.3)
    filters.push(`sepia(${((weights.film - 0.3) * 0.5).toFixed(2)})`);
  ctx.filter = filters.join(" ");
  // Длина перехода: жёсткая склейка для напряжённых дней, растворение для остальных
  const xf =
    timeline.transition === "cut"
      ? 0
      : timeline.transition === "stroke-reveal"
        ? 1.4
        : 1.2;
  drawTimeline(ctx, s.prepared, s.shots, f.t, rect.w, rect.h, xf);
  ctx.filter = "none";

  // Мазки по цветам текущего фото
  const i = shotAt(s.shots, f.t);
  const shot = s.shots[i];
  const p = clamp((f.t - shot.start) / Math.max(0.1, shot.end - shot.start));
  const reveal =
    timeline.transition === "stroke-reveal" ? clamp(p * 1.4) : clamp(0.35 + p);
  drawStrokes(
    ctx,
    s.strokes[shot.photoIndex] ?? [],
    rect.w,
    rect.h,
    weights.paint,
    reveal,
    s.style.strokes.curvature,
    Math.sin(f.t * 0.4),
  );

  // Двойная экспозиция: другой кадр зеркально, в режиме «экран»
  const de = s.style.doubleExposure;
  if (de > 0) {
    const n = s.images.length;
    const other = s.images[(shot.photoIndex + 1) % n];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = de * (0.5 + 0.15 * Math.sin(f.t * 0.7));
    ctx.filter = "grayscale(0.6) contrast(1.2)";
    const k =
      Math.max(rect.w / other.width, rect.h / other.height) * (1.15 + 0.05 * p);
    ctx.translate(rect.w / 2, rect.h / 2);
    ctx.scale(-1, 1);
    ctx.drawImage(
      other,
      (-other.width * k) / 2 + rect.w * 0.08,
      (-other.height * k) / 2,
      other.width * k,
      other.height * k,
    );
    ctx.restore();
  }
  ctx.restore();
}
