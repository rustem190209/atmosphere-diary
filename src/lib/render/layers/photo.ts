// Слои фото и живописи: кадры в рамке с медленным приближением (Ken Burns), переходы,
// мазки «по Моне» поверх фото и двойная экспозиция.
import { FRAME, type FrameInput, type Scene, type Stroke } from "../types";
import { clamp } from "../../schema";

const ease = (x: number) => x * x * (3 - 2 * x); // плавный старт и финиш

// Какой кадр сейчас и сколько прошло от его начала
export function segmentAt(s: Scene, t: number) {
  const cuts = s.style.timeline.cuts;
  let i = 0;
  while (i + 1 < cuts.length && cuts[i + 1] <= t) i++;
  const start = cuts[i] ?? 0;
  const end = cuts[i + 1] ?? s.style.timeline.duration - 2;
  return { i, local: t - start, len: Math.max(0.5, end - start) };
}


function matteInset(s: Scene) {
  return Math.round(s.style.negativeSpace * 150);
}

// Нарисовать одно фото с трансформацией камеры и его мазками
function drawShot(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  imgIdx: number,
  seg: number,
  p: number,
  rect: { x: number; y: number; w: number; h: number },
  beat: number,
  strokeReveal: number,
) {
  const img = s.images[imgIdx];
  const { camera, grade, weights } = s.style;
  // Чётные кадры приближаются, нечётные отдаляются — так монтаж не однообразный
  const zIn = seg % 2 === 0;
  const zoom = zIn
    ? camera.zoomFrom + (camera.zoomTo - camera.zoomFrom) * ease(p)
    : camera.zoomTo - (camera.zoomTo - camera.zoomFrom) * ease(p);
  const panX = Math.sin(seg * 1.7 + p * Math.PI) * camera.panAmp * rect.w;
  const panY = Math.cos(seg * 2.3 + p * Math.PI) * camera.panAmp * rect.h * 0.6;
  const shake = camera.shakeAmp * rect.w * beat;
  const sx = shake ? Math.sin(p * 97 + seg) * shake : 0;
  const sy = shake ? Math.cos(p * 89 + seg) * shake : 0;

  // Вписать фото «по заполнению» (cover)
  const k = Math.max(rect.w / img.width, rect.h / img.height) * zoom;
  const dw = img.width * k,
    dh = img.height * k;
  const cx = rect.x + rect.w / 2 + panX + sx,
    cy = rect.y + rect.h / 2 + panY + sy;

  ctx.save();
  const filters = [
    `saturate(${grade.saturation.toFixed(2)})`,
    `contrast(${grade.contrast.toFixed(2)})`,
    `hue-rotate(${grade.hueShift.toFixed(1)}deg)`,
  ];
  if (weights.film > 0.3)
    filters.push(`sepia(${((weights.film - 0.3) * 0.5).toFixed(2)})`);
  if (weights.paint > 0.5)
    filters.push(`blur(${((weights.paint - 0.5) * 4).toFixed(1)}px)`); // мягкость живописи
  ctx.filter = filters.join(" ");
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.filter = "none";

  // Мазки повторяют движение камеры: рисуем их в той же системе координат
  drawStrokes(
    ctx,
    s.strokes[imgIdx],
    cx - dw / 2,
    cy - dh / 2,
    dw,
    dh,
    weights.paint,
    strokeReveal,
    s.style.strokes.curvature,
  );
  ctx.restore();
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  x: number,
  y: number,
  w: number,
  h: number,
  paint: number,
  reveal: number,
  curvature: number,
) {
  if (paint < 0.08) return;
  ctx.lineCap = "round";
  const alpha = clamp(0.25 + paint * 0.6);
  for (const st of strokes) {
    if (st.order > reveal) continue;
    const px = x + st.u * w,
      py = y + st.v * h;
    const dx = (Math.cos(st.angle) * st.len) / 2,
      dy = (Math.sin(st.angle) * st.len) / 2;
    const bx = -dy * st.bend * curvature,
      by = dx * st.bend * curvature; // изгиб перпендикулярно мазку
    ctx.strokeStyle = st.color;
    ctx.globalAlpha = alpha * clamp((reveal - st.order) * 6); // мазок проявляется плавно
    ctx.lineWidth = st.width;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.quadraticCurveTo(px + bx, py + by, px + dx, py + dy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Маска «проявления мазками» для перехода stroke-reveal
function strokeMask(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  prog: number,
  seed: number,
) {
  ctx.beginPath();
  const n = 26;
  for (let k = 0; k < n; k++) {
    const r1 = Math.abs(Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(seed * 39.3468 + k * 11.135) * 24634.6345) % 1;
    const cx = rect.x + r1 * rect.w,
      cy = rect.y + r2 * rect.h;
    const rad = Math.max(0, prog * 1.6 - (k / n) * 0.6) * rect.w * 0.45;
    if (rad <= 0) continue;
    ctx.moveTo(cx + rad, cy);
    ctx.ellipse(cx, cy, rad, rad * 0.55, r1 * Math.PI, 0, Math.PI * 2);
  }
  ctx.clip();
}

export function drawPhotoLayer(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  f: FrameInput,
  beat: number,
) {
  const n = s.images.length;
  if (!n) return;
  const inset = matteInset(s);
  const rect = {
    x: FRAME.x + inset,
    y: FRAME.y + inset,
    w: FRAME.w - inset * 2,
    h: FRAME.h - inset * 2,
  };
  const { i, local, len } = segmentAt(s, f.t);
  const p = clamp(local / len);
  const tl = s.style.timeline;
  const tDur =
    tl.transition === "cut"
      ? 0
      : tl.transition === "crossfade"
        ? Math.min(1.2, len * 0.5)
        : Math.min(1.4, len * 0.6);
  const strokeReveal = clamp(local / (len * 0.7));

  // Паспарту: светлая/тёмная подложка рамки, на ней фото с воздухом вокруг
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

  const cur = i % n;
  const inTransition = i > 0 && local < tDur;
  if (inTransition) {
    // Предыдущий кадр в его конечном состоянии
    const prevLen = tl.cuts[i] - tl.cuts[i - 1];
    drawShot(
      ctx,
      s,
      (i - 1) % n,
      i - 1,
      clamp((prevLen + local) / prevLen),
      rect,
      beat,
      1,
    );
    const tp = ease(local / tDur);
    ctx.save();
    if (tl.transition === "crossfade") ctx.globalAlpha = tp;
    else strokeMask(ctx, rect, tp, i);
    drawShot(ctx, s, cur, i, p, rect, beat, strokeReveal);
    ctx.restore();
  } else {
    drawShot(ctx, s, cur, i, p, rect, beat, strokeReveal);
  }

  // Двойная экспозиция: следующий кадр зеркально, в режиме «экран»
  const de = s.style.doubleExposure;
  if (de > 0) {
    const other = s.images[(cur + 1) % n];
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = de * (0.5 + 0.15 * Math.sin(f.t * 0.7));
    ctx.filter = "grayscale(0.6) contrast(1.2)";
    const k =
      Math.max(rect.w / other.width, rect.h / other.height) * (1.15 + 0.05 * p);
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
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
