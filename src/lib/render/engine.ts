// Движок сцены (раздел 8.8 ТЗ): подготовка ресурсов дня и рисование кадра по времени.
// Слои снизу вверх: фон → фото+мазки → геометрия → плёнка → постоянные элементы.
import type { DayRecord } from "../schema";
import { adjust, luminance } from "../color";
import { seededRandom } from "./random";
import {
  FRAME,
  H,
  W,
  type Fonts,
  type FrameInput,
  type Scene,
  type Shape,
  type Stroke,
} from "./types";
import { drawBackground } from "./layers/background";
import { drawPhotoLayer } from "./layers/photo";
import { preparePhoto } from "./virtualCamera";
import { cameraPlan } from "./cameraPlan";
import { drawGeometryLayer } from "./layers/geometry";
import { drawFilmLayer } from "./layers/film";
import { drawConstants } from "./layers/constants";

// Размер превью: в 2 раза меньше логического холста
export const PREVIEW_SCALE = 0.5;

function makeNoise(
  size: number,
  rnd: () => number,
  contrast: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 255 * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Маленькая сетка цветов фото — мазки берут цвет «из-под себя»
function colorGrid(img: ImageBitmap, gw = 24, gh = 30) {
  const c = document.createElement("canvas");
  c.width = gw;
  c.height = gh;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  // То же «cover»-кадрирование, что и при показе в рамке 4:5
  const k = Math.max(gw / img.width, gh / img.height);
  ctx.drawImage(
    img,
    (gw - img.width * k) / 2,
    (gh - img.height * k) / 2,
    img.width * k,
    img.height * k,
  );
  const d = ctx.getImageData(0, 0, gw, gh).data;
  return (u: number, v: number) => {
    const x = Math.min(gw - 1, Math.floor(u * gw)),
      y = Math.min(gh - 1, Math.floor(v * gh));
    const i = (y * gw + x) * 4;
    return [d[i], d[i + 1], d[i + 2]] as const;
  };
}

function makeStrokes(
  img: ImageBitmap,
  day: DayRecord,
  rnd: () => number,
): Stroke[] {
  const { strokes, weights } = day.style;
  const count = Math.round(120 + 520 * strokes.density * weights.paint);
  const grid = colorGrid(img);
  const out: Stroke[] = [];
  for (let k = 0; k < count; k++) {
    const u = rnd(),
      v = rnd();
    const [r, g, b] = grid(u, v);
    const j = (rnd() - 0.5) * 30; // небольшой разброс цвета — «живой» мазок
    out.push({
      u,
      v,
      // направление мазков — плавное «поле», как движение кисти
      angle:
        Math.sin(u * 4.1 + v * 2.3) * 1.2 +
        Math.cos(v * 5.3) * 0.6 +
        (rnd() - 0.5) * 0.5,
      len: (0.03 + 0.07 * strokes.length) * FRAME.w * (0.6 + rnd() * 0.8),
      width: (10 + 16 * strokes.length) * (0.6 + rnd() * 0.7),
      bend: (rnd() - 0.5) * 1.4,
      color: `rgb(${Math.round(r + j)},${Math.round(g + j)},${Math.round(b + j * 0.6)})`,
      order: rnd(),
    });
  }
  return out;
}

function makeShapes(day: DayRecord, rnd: () => number): Shape[] {
  const { shapes, palette, weights } = day.style;
  const count = Math.round(
    5 + 18 * shapes.density * Math.min(1, weights.geometry * 1.5),
  );
  const out: Shape[] = [];
  for (let k = 0; k < count; k++) {
    const r = rnd();
    // Угловатость решает, будут ли фигуры острыми (треугольники, линии) или круглыми
    const kind: Shape["kind"] =
      r < shapes.angularity * 0.45
        ? "triangle"
        : r < shapes.angularity * 0.9
          ? "line"
          : r < 0.75
            ? "circle"
            : rnd() < 0.5
              ? "ring"
              : "half";
    // Чаще по краям и вокруг рамки, реже в центре фото
    const edge = rnd() < 0.65;
    const x = edge
      ? rnd() < 0.5
        ? rnd() * 220
        : W - rnd() * 220
      : 120 + rnd() * (W - 240);
    const y = 180 + rnd() * (H - 420);
    out.push({
      kind,
      x,
      y,
      size: kind === "line" ? 180 + rnd() * 380 : 50 + rnd() * 200,
      rot: rnd() * Math.PI * 2,
      spin: (rnd() - 0.5) * 0.15,
      color: palette[Math.floor(rnd() * palette.length)],
      fill: rnd() < 0.6,
      phase: rnd(),
    });
  }
  return out;
}

function readFonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) =>
    css.getPropertyValue(name).trim() || fb;
  return {
    serif: v("--font-serif", "Georgia, serif"),
    sans: v("--font-sans", "sans-serif"),
    hand: v("--font-hand", "cursive"),
  };
}

export async function prepareScene(
  day: DayRecord,
  photoBlobs?: Blob[],
): Promise<Scene> {
  const rnd = seededRandom(day.id);
  const images = await Promise.all(
    (photoBlobs ?? day.input.photos).map((b) => createImageBitmap(b)),
  );
  // Подготовка для камеры: точка интереса, размытый фон и резкий объект (один раз на фото)
  const prepared = images.map((img) => preparePhoto(img, 1280));
  const fonts = readFonts();
  // Ждём загрузки шрифтов, иначе первые кадры нарисуются запасным шрифтом
  await Promise.all([
    document.fonts.load(`400 40px ${fonts.serif}`),
    document.fonts.load(`700 40px ${fonts.serif}`),
    document.fonts.load(`40px ${fonts.hand}`),
    document.fonts.load(`500 40px ${fonts.sans}`),
  ]).catch(() => undefined);

  const pal = day.style.palette;
  const byLum = [...pal].sort((a, b) => luminance(a) - luminance(b));
  const avgLum = pal.reduce((s, c) => s + luminance(c), 0) / pal.length;
  // Тёмный фон для ночи, напряжения или тёмных фото; иначе — светлая «бумага»
  const dark =
    day.mood.timeOfDay === "night" || day.mood.tension > 0.6 || avgLum < 0.3;
  const bg: [string, string] = dark
    ? [adjust(byLum[0], 0, 0.7, -0.04), adjust(byLum[1], 0, 0.6, -0.02)]
    : [
        adjust(byLum[byLum.length - 1], 0, 0.45, 0.12),
        adjust(byLum[byLum.length - 2], 0, 0.5, 0.06),
      ];
  const ink = dark ? "#f3ede4" : adjust(byLum[0], 0, 0.5, -0.1);

  return {
    style: day.style,
    mood: day.mood,
    title: day.title,
    dateLabel: new Date(day.createdAt).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    bpm: day.audio.bpm,
    images,
    strokes: images.map((img) => makeStrokes(img, day, rnd)),
    prepared,
    shots: cameraPlan(
      day,
      prepared.map((p) => ({ w: p.w, h: p.h, focus: p.focus })),
    ),
    shapes: makeShapes(day, rnd),
    grain: makeNoise(256, rnd, 0.9),
    paper: makeNoise(512, rnd, 0.35),
    dark,
    ink,
    bg,
    fonts,
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: Scene,
  f: FrameInput,
) {
  const t = Math.min(f.t, s.style.timeline.duration);
  // Бит: короткий импульс на каждую долю песни + громкость, если её можно измерить
  const phase = ((t * s.bpm) / 60) % 1;
  const beat = Math.max(Math.exp(-phase * 5) * 0.7, f.amp);

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, s, t);
  drawPhotoLayer(ctx, s, { t, amp: f.amp });
  drawGeometryLayer(ctx, s, t, beat);
  drawFilmLayer(ctx, s, t, f.amp);
  drawConstants(ctx, s, t);
  ctx.restore();
}

// Постер — один кадр сцены для карточки архива
export async function renderPoster(s: Scene): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = W * 0.4;
  c.height = H * 0.4;
  const ctx = c.getContext("2d")!;
  ctx.scale(0.4, 0.4);
  drawFrame(ctx, s, {
    t: Math.min(
      s.style.timeline.cutInterval * 0.6,
      s.style.timeline.duration - 3,
    ),
    amp: 0,
  });
  return new Promise((res, rej) =>
    c.toBlob(
      (b) => (b ? res(b) : rej(new Error("Не удалось сохранить постер"))),
      "image/jpeg",
      0.85,
    ),
  );
}
