// Анализ фото в браузере (раздел 8.4 ТЗ): палитра из 5 цветов, яркость, контраст, теплота, насыщенность.
import { clamp, type PhotoSpec } from "../schema";

// Уменьшить фото до maxSide по длинной стороне и вернуть JPEG-Blob
export async function resizeImage(
  file: Blob,
  maxSide: number,
  quality = 0.88,
): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось сжать фото"))),
      "image/jpeg",
      quality,
    ),
  );
}

// Пиксели фото, уменьшенного до 64×64
async function samplePixels(file: Blob): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 64, 64);
  bmp.close();
  return ctx.getImageData(0, 0, 64, 64).data;
}

const toHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(clamp(v, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

// Насыщенность цвета 0..1 (как в HSL)
function sat(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

// Простой k-means: 5 групп похожих цветов, 8 итераций
function kmeans(
  pixels: number[][],
  k = 5,
): { color: number[]; share: number }[] {
  // Стартовые центры — равномерно по пикселям, отсортированным по яркости (стабильно, без случайности)
  const sorted = [...pixels].sort(
    (a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]),
  );
  let centers = Array.from({ length: k }, (_, i) =>
    sorted[Math.floor(((i + 0.5) / k) * sorted.length)].slice(),
  );
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (p[0] - centers[c][0]) ** 2 +
          (p[1] - centers[c][1]) ** 2 +
          (p[2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    centers = centers.map((c, i) =>
      counts[i] ? sums[i].map((s) => s / counts[i]) : c,
    );
  }
  return centers
    .map((color, i) => ({ color, share: counts[i] / pixels.length }))
    .sort((a, b) => b.share - a.share);
}

export async function analyzePhotos(files: Blob[]): Promise<PhotoSpec> {
  if (files.length === 0) throw new Error("Нет фото для анализа");
  const all: number[][] = [];
  let lumSum = 0,
    lumSq = 0,
    warmSum = 0,
    satSum = 0,
    n = 0;

  for (const f of files) {
    const data = await samplePixels(f);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      lumSum += lum;
      lumSq += lum * lum;
      warmSum += (r - b) / 255; // теплота: баланс красного и синего
      satSum += sat(r, g, b);
      n++;
      if (i % 8 === 0) all.push([r, g, b]); // каждый второй пиксель — для палитры хватит
    }
  }

  const brightness = lumSum / n;
  const std = Math.sqrt(Math.max(0, lumSq / n - brightness ** 2));
  const clusters = kmeans(all, 5);

  return {
    count: files.length,
    palette: clusters.map((c) => ({
      hex: toHex(c.color[0], c.color[1], c.color[2]),
      share: +c.share.toFixed(3),
    })),
    brightness: +clamp(brightness).toFixed(3),
    contrast: +clamp(std / 0.3).toFixed(3), // std 0.3 и выше — максимально контрастное фото
    warmth: +clamp(0.5 + (warmSum / n) * 1.6).toFixed(3), // 0.5 — нейтрально; >0.6 тёплое, <0.4 холодное
    saturation: +clamp(satSum / n).toFixed(3),
  };
}
