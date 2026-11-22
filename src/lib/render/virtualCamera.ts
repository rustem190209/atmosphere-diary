// src/lib/render/virtualCamera.ts
// «Виртуальный оператор»: из одной или нескольких фото делает кинематографичный монтаж.
// Что даёт движение:
//   1) несколько планов из ОДНОГО фото (общий → средний → деталь) с разными точками интереса;
//   2) Ken Burns (наезд/отъезд + панорама), ритм смен кадров по долям такта песни;
//   3) параллакс и «глубина резкости»: резкий объект + размытый фон двигаются с разной скоростью;
//   4) ручная съёмка (лёгкая тряска), удары камеры на бит и на пики пульса;
//   5) пыль, засвет, зерно, виньетка.
// Всё — Canvas 2D, без внешних библиотек и без генерации видео. Честно: это имитация глубины
// (карта глубины не считается), но визуально фото оживает и каждый кадр управляется профилем дня.

export type ShotKind = "wide" | "medium" | "detail";
export type Ease = "inOut" | "inOutSlow" | "out";

export interface ShotPlan {
  photoIndex: number;
  start: number;
  end: number;
  kind: ShotKind;
  from: { cx: number; cy: number; zoom: number };
  to: { cx: number; cy: number; zoom: number };
  ease: Ease;
  bgBlurFrom: number; // px при ширине холста 1080
  bgBlurTo: number;
  shake: number; // доля ширины холста
  punches: number[]; // абсолютные времена «ударов» камеры
}

export interface PlanOptions {
  photos: { w: number; h: number; focus: { x: number; y: number } }[];
  duration: number; // сек
  cutInterval: number; // из mapToStyle
  bpm: number;
  energy: number; // 0..1 динамика (E_m)
  tension: number; // 0..1
  peaks?: number[]; // пики пульса 0..1 по длине ролика
  seed: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function beatTimes(bpm: number, duration: number, every = 1): number[] {
  const beat = 60 / bpm;
  const out: number[] = [];
  for (let i = 0; i * beat < duration; i += every) out.push(i * beat);
  return out;
}

/** Грубая «карта внимания»: контраст + насыщенность + смещение к центру. Возвращает точку интереса 0..1. */
export function findFocus(img: { data: ArrayLike<number>; width: number; height: number }): { x: number; y: number } {
  const G = 24;
  const cw = img.width / G, ch = img.height / G;
  const lum = new Array(G * G).fill(0), sat = new Array(G * G).fill(0);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let l = 0, s = 0, n = 0;
    for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y++) for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x++) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      l += 0.299 * r + 0.587 * g + 0.114 * b;
      s += Math.max(r, g, b) - Math.min(r, g, b);
      n++;
    }
    lum[gy * G + gx] = n ? l / n / 255 : 0;
    sat[gy * G + gx] = n ? s / n / 255 : 0;
  }
  const sal = new Array(G * G).fill(0);
  let total = 0;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let contrast = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx, y = gy + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < G && y < G) { contrast += Math.abs(lum[gy * G + gx] - lum[y * G + x]); k++; }
    }
    const center = Math.exp(-(((gx / G - 0.5) ** 2 + (gy / G - 0.5) ** 2) / 0.18));
    const v = (contrast / (k || 1)) * 1.6 + sat[gy * G + gx] * 0.5 + center * 0.25;
    sal[gy * G + gx] = v;
    total += v;
  }
  const thr = [...sal].sort((a, b) => b - a)[Math.floor(G * G * 0.15)];
  let sx = 0, sy = 0, sw = 0;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const v = sal[gy * G + gx];
    if (v >= thr) { sx += (gx + 0.5) * v; sy += (gy + 0.5) * v; sw += v; }
  }
  void total;
  return sw ? { x: clamp(sx / sw / G, 0.15, 0.85), y: clamp(sy / sw / G, 0.15, 0.85) } : { x: 0.5, y: 0.5 };
}

/** План съёмки: список планов с таймингами, зумом, панорамой, размытием фона и ударами камеры. */
export function planShots(o: PlanOptions): ShotPlan[] {
  const rnd = mulberry32(o.seed);
  const beat = 60 / o.bpm;
  const kinds: ShotKind[] = o.energy > 0.65 ? ["medium", "detail", "wide", "detail", "medium"] : o.energy > 0.35 ? ["wide", "medium", "detail", "medium"] : ["wide", "medium", "wide", "detail"];
  const ease: Ease = o.energy < 0.35 ? "inOutSlow" : o.energy > 0.65 ? "out" : "inOut";
  const d = lerp(0.04, 0.14, o.energy);
  const panAmp = lerp(0.02, 0.08, o.energy);
  const shake = o.energy > 0.5 ? 0.0006 + 0.004 * (o.energy - 0.5) * 2 : 0.0004;
  const peakTimes = (o.peaks ?? []).map((p) => p * o.duration);
  const beatsAll = o.energy > 0.5 ? beatTimes(o.bpm, o.duration, 4) : [];
  const shots: ShotPlan[] = [];
  let t = 0, i = 0, dir = rnd() < 0.5 ? -1 : 1;
  while (t < o.duration - 0.05) {
    let len = o.cutInterval * (0.85 + rnd() * 0.3);
    len = Math.max(beat, Math.round(len / beat) * beat); // смена кадра на долю такта
    const end = Math.min(o.duration, t + len);
    const ph = o.photos[i % o.photos.length];
    const kind = kinds[i % kinds.length];
    const f = ph.focus;
    const j = () => (rnd() - 0.5) * 0.2;
    const c = kind === "wide"
      ? { x: lerp(0.5, f.x, 0.3), y: lerp(0.5, f.y, 0.3) }
      : kind === "medium"
        ? { x: f.x, y: f.y }
        : { x: clamp(f.x + j(), 0.2, 0.8), y: clamp(f.y + j(), 0.2, 0.8) };
    const z0 = kind === "wide" ? 1.0 : kind === "medium" ? 1.28 : 1.75;
    const dz = d * (kind === "detail" ? 1.2 : 1);
    const zoomIn = dir > 0;
    shots.push({
      photoIndex: i % o.photos.length,
      start: t, end, kind, ease,
      from: { cx: c.x - dir * panAmp * 0.5, cy: c.y, zoom: zoomIn ? z0 : z0 + dz },
      to: { cx: c.x + dir * panAmp * 0.5, cy: c.y, zoom: zoomIn ? z0 + dz : z0 },
      bgBlurFrom: kind === "detail" ? 2 : lerp(3, 8, 1 - o.energy),
      bgBlurTo: kind === "detail" ? 10 : lerp(3, 8, 1 - o.energy),
      shake,
      punches: [...beatsAll.filter((b) => b >= t && b < end), ...peakTimes.filter((p) => p >= t && p < end)],
    });
    t = end; i++; dir = -dir;
  }
  return shots;
}

export function shotAt(shots: ShotPlan[], t: number): number {
  const i = shots.findIndex((s) => t >= s.start && t < s.end);
  return i === -1 ? shots.length - 1 : i;
}

const easeFn = (e: Ease, u: number) => {
  u = clamp(u);
  if (e === "out") return 1 - (1 - u) ** 3;
  if (e === "inOutSlow") return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
  return -(Math.cos(Math.PI * u) - 1) / 2;
};

/** Удар камеры: короткий всплеск зума около момента времени. */
export function punchAt(shot: ShotPlan, t: number): number {
  let v = 0;
  for (const p of shot.punches) if (t >= p) v += Math.exp(-(t - p) * 9) * 0.03;
  return v;
}

export function handheld(t: number, amount: number) {
  return {
    x: (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1) * 0.3 + Math.sin(t * 5.1 + 2) * 0.1) * amount,
    y: (Math.sin(t * 1.1 + 0.5) * 0.6 + Math.sin(t * 3.3 + 2) * 0.3 + Math.sin(t * 4.7) * 0.1) * amount,
  };
}

// ---------- Рисование (браузер) ----------

export interface PreparedPhoto {
  w: number; h: number;
  fg: HTMLCanvasElement; // резкий объект с мягкой маской
  bg: HTMLCanvasElement; // размытый фон
  focus: { x: number; y: number };
}

/** Подготовка фото ОДИН раз: уменьшение, точка интереса, размытый фон, вырезанный резкий объект. */
export function preparePhoto(src: HTMLImageElement | ImageBitmap, maxSide = 1280): PreparedPhoto {
  const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
  const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const mk = (cw: number, ch: number) => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };

  const base = mk(w, h);
  base.getContext("2d")!.drawImage(src, 0, 0, w, h);

  const small = mk(64, Math.max(1, Math.round((64 * h) / w)));
  const sctx = small.getContext("2d")!;
  sctx.drawImage(base, 0, 0, small.width, small.height);
  const focus = findFocus(sctx.getImageData(0, 0, small.width, small.height));

  // фон: уменьшили в 12 раз и растянули обратно — получилось размытие, работает и в Safari
  const tiny = mk(Math.max(8, Math.round(w / 12)), Math.max(8, Math.round(h / 12)));
  tiny.getContext("2d")!.drawImage(base, 0, 0, tiny.width, tiny.height);
  const bg = mk(w, h);
  const bctx = bg.getContext("2d")!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(tiny, 0, 0, w, h);

  // резкий объект: исходник × радиальная маска вокруг точки интереса
  const fg = mk(w, h);
  const fctx = fg.getContext("2d")!;
  fctx.drawImage(base, 0, 0);
  fctx.globalCompositeOperation = "destination-in";
  const r = Math.min(w, h);
  const g = fctx.createRadialGradient(focus.x * w, focus.y * h, r * 0.16, focus.x * w, focus.y * h, r * 0.6);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  fctx.fillStyle = g;
  fctx.fillRect(0, 0, w, h);
  return { w, h, fg, bg, focus };
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, p: PreparedPhoto, W: number, H: number, cx: number, cy: number, zoom: number, ox: number, oy: number) {
  const scale = Math.max(W / p.w, H / p.h) * zoom;
  const dw = p.w * scale, dh = p.h * scale;
  const dx = clamp(W / 2 - cx * dw + ox, W - dw, 0);
  const dy = clamp(H / 2 - cy * dh + oy, H - dh, 0);
  ctx.drawImage(layer, dx, dy, dw, dh);
}

/** Рисует один план в момент t: фон (медленнее и размыт) + резкий объект (быстрее, чуть крупнее). */
export function drawShot(ctx: CanvasRenderingContext2D, p: PreparedPhoto, s: ShotPlan, t: number, W: number, H: number, alpha = 1) {
  const u = easeFn(s.ease, (t - s.start) / Math.max(0.001, s.end - s.start));
  const cx = lerp(s.from.cx, s.to.cx, u), cy = lerp(s.from.cy, s.to.cy, u);
  const zoom = lerp(s.from.zoom, s.to.zoom, u) * (1 + punchAt(s, t));
  const hh = handheld(t, s.shake * W);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawLayer(ctx, p.bg, p, W, H, lerp(0.5, cx, 0.55), lerp(0.5, cy, 0.55), zoom * 1.0, hh.x * 0.6, hh.y * 0.6);
  drawLayer(ctx, p.fg, p, W, H, cx, cy, zoom * 1.05, hh.x, hh.y);
  ctx.restore();
}

/** Весь монтаж: кадр t с кроссфейдом на стыках. xf = длительность перехода (0 для жёсткой склейки). */
export function drawTimeline(ctx: CanvasRenderingContext2D, photos: PreparedPhoto[], shots: ShotPlan[], t: number, W: number, H: number, xf: number) {
  const i = shotAt(shots, t);
  const s = shots[i];
  drawShot(ctx, photos[s.photoIndex], s, t, W, H, 1);
  if (xf > 0 && i > 0 && t - s.start < xf) {
    const prev = shots[i - 1];
    drawShot(ctx, photos[prev.photoIndex], prev, Math.min(t, prev.end - 0.001), W, H, 1 - (t - s.start) / xf);
  }
}

// ---------- Плёночные эффекты ----------

export function makeGrainTile(size = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

export function drawGrain(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, W: number, H: number, amount: number) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(amount * 0.35);
  ctx.globalCompositeOperation = "overlay";
  const ox = -Math.random() * tile.width, oy = -Math.random() * tile.height;
  for (let x = ox; x < W; x += tile.width) for (let y = oy; y < H; y += tile.height) ctx.drawImage(tile, x, y);
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${clamp(amount) * 0.8})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function drawLightLeak(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, amount: number, hue: number) {
  if (amount <= 0) return;
  const x = W * (0.5 + 0.55 * Math.sin(t * 0.35)), y = H * (0.25 + 0.2 * Math.sin(t * 0.21 + 1));
  const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.8);
  g.addColorStop(0, `hsla(${hue},90%,60%,${clamp(amount) * 0.45})`);
  g.addColorStop(1, `hsla(${hue},90%,50%,0)`);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawDust(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, amount: number, seed: number) {
  const rnd = mulberry32(seed);
  const n = Math.round(amount * 60);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < n; i++) {
    const sp = 6 + rnd() * 18, ph = rnd() * 100;
    const x = (rnd() * W + t * sp * (rnd() < 0.5 ? 1 : -1) + Math.sin(t + ph) * 12 + W * 4) % W;
    const y = (rnd() * H - t * sp * 0.6 + H * 4) % H;
    ctx.globalAlpha = 0.15 + 0.4 * rnd();
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
