// Демо-дни при первом запуске (раздел 3 и 12 ТЗ).
// Читает public/demo/days.json. Фото и музыка — либо файлы команды, либо генерируются кодом
// (абстрактные «сцены» и простой синтезированный трек), чтобы не использовать чужие материалы.
import type { CheckIn } from "../schema";
import type { SongMeta } from "../audio/analyze";
import { buildDay } from "../pipeline";
import { getDay } from "../storage/db";
import { demoPulse, type DemoPulse } from "../physio";
import { seededRandom } from "../render/random";

interface DemoDay {
  id: string;
  date: string;
  text: string;
  photos?: string[];
  scene?: "park" | "office" | "city" | "rain" | "room" | "lake" | "festive";
  palettes?: [string, string, string][];
  song: {
    file?: string;
    url?: string;
    synth?: { bpm: number; mode: "major" | "minor" };
  };
  meta?: SongMeta;
  checkIn?: CheckIn;
  physio?: DemoPulse; // демо-пульс (честно помечается как демо-данные)
}

const FLAG = "diary-demo-seeded-v1";

export function demoAlreadySeeded(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function markSeeded() {
  try {
    localStorage.setItem(FLAG, "1");
  } catch {
    /* приватный режим — не страшно, просто предложим примеры снова */
  }
}

// Дополнительные сцены: дождь за окном, комната с лампой, озеро, праздничные огни
function drawExtraScene(
  x: CanvasRenderingContext2D,
  scene: "rain" | "room" | "lake" | "festive",
  [, c2, c3]: [string, string, string],
  rnd: () => number,
  w: number,
  h: number,
) {
  const blurDots = (n: number, colors: string[], maxR: number, yMax = 1) => {
    x.filter = "blur(16px)";
    for (let i = 0; i < n; i++) {
      x.globalAlpha = 0.25 + rnd() * 0.55;
      x.fillStyle = colors[Math.floor(rnd() * colors.length)];
      x.beginPath();
      x.arc(rnd() * w, rnd() * h * yMax, 20 + rnd() * maxR, 0, Math.PI * 2);
      x.fill();
    }
    x.filter = "none";
    x.globalAlpha = 1;
  };

  if (scene === "rain") {
    blurDots(18, [c3], 70, 0.8); // огни улицы сквозь стекло
    x.strokeStyle = c3;
    x.lineWidth = 2;
    for (let i = 0; i < 260; i++) {
      x.globalAlpha = 0.15 + rnd() * 0.35;
      const sx = rnd() * w,
        sy = rnd() * h,
        len = 30 + rnd() * 90;
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx - 6, sy + len);
      x.stroke();
    }
    x.globalAlpha = 1;
    // Рама окна
    x.fillStyle = c2;
    x.fillRect(w * 0.48, 0, 26, h);
    x.fillRect(0, h * 0.55, w, 26);
  } else if (scene === "room") {
    // Тёплая лампа и рамки старых фотографий на стене
    const lamp = x.createRadialGradient(
      w * 0.75,
      h * 0.3,
      10,
      w * 0.75,
      h * 0.3,
      650,
    );
    lamp.addColorStop(0, c3);
    lamp.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = lamp;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const fw = 140 + rnd() * 140,
        fh = fw * (1.1 + rnd() * 0.3);
      const fx = rnd() * (w - fw),
        fy = rnd() * h * 0.6;
      x.globalAlpha = 0.85;
      x.fillStyle = c2;
      x.fillRect(fx, fy, fw, fh);
      x.fillStyle = c3;
      x.globalAlpha = 0.5;
      x.fillRect(fx + 14, fy + 14, fw - 28, fh - 28);
    }
    x.globalAlpha = 1;
    x.fillStyle = c2;
    x.fillRect(0, h * 0.8, w, h * 0.2); // стол
  } else if (scene === "lake") {
    // Небо, солнце, вода с бликами, берег
    x.fillStyle = c3;
    x.beginPath();
    x.arc(w * (0.3 + rnd() * 0.4), h * 0.28, 110, 0, Math.PI * 2);
    x.fill();
    const water = x.createLinearGradient(0, h * 0.5, 0, h);
    water.addColorStop(0, c2);
    water.addColorStop(1, "#1d3b4f");
    x.fillStyle = water;
    x.fillRect(0, h * 0.5, w, h * 0.5);
    x.fillStyle = c3;
    for (let i = 0; i < 90; i++) {
      x.globalAlpha = 0.2 + rnd() * 0.6;
      x.fillRect(
        rnd() * w,
        h * (0.5 + rnd() * 0.45),
        20 + rnd() * 80,
        3 + rnd() * 4,
      );
    }
    x.globalAlpha = 1;
  } else {
    // Праздничные огни: гирлянда разноцветного боке
    blurDots(60, [c3, "#ffcf6e", "#ff8a7a", "#fff2c8"], 60, 0.9);
    x.fillStyle = c2;
    x.fillRect(0, h * 0.78, w, h * 0.22);
    blurDots(12, ["#fff2c8"], 30, 1);
  }
}

// ---------- Генерация фото: абстрактная сцена в палитре дня ----------
async function makeScenePhoto(
  scene: DemoDay["scene"],
  [c1, c2, c3]: [string, string, string],
  seed: string,
): Promise<File> {
  const rnd = seededRandom(seed);
  const w = 1200,
    h = 1500;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, c1);
  sky.addColorStop(1, c2);
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);

  if (
    scene === "rain" ||
    scene === "room" ||
    scene === "lake" ||
    scene === "festive"
  ) {
    drawExtraScene(x, scene, [c1, c2, c3], rnd, w, h);
  } else if (scene === "office") {
    // Окна ночного офиса и свечение экрана
    for (let i = 0; i < 70; i++) {
      x.globalAlpha = 0.25 + rnd() * 0.6;
      x.fillStyle = c3;
      x.fillRect(rnd() * w, rnd() * h * 0.7, 40 + rnd() * 140, 14 + rnd() * 30);
    }
    x.globalAlpha = 0.9;
    const glow = x.createRadialGradient(
      w / 2,
      h * 0.8,
      10,
      w / 2,
      h * 0.8,
      500,
    );
    glow.addColorStop(0, c3);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = glow;
    x.fillRect(0, h * 0.4, w, h * 0.6);
  } else {
    // Мягкие огни (боке)
    x.filter = "blur(18px)";
    for (let i = 0; i < 34; i++) {
      x.globalAlpha = 0.25 + rnd() * 0.5;
      x.fillStyle = c3;
      x.beginPath();
      x.arc(rnd() * w, rnd() * h * 0.75, 30 + rnd() * 120, 0, Math.PI * 2);
      x.fill();
    }
    x.filter = "none";
    x.globalAlpha = 1;
    x.fillStyle = c2;
    if (scene === "park") {
      // Стволы деревьев и земля
      for (let i = 0; i < 7; i++) {
        const tx = rnd() * w,
          tw = 18 + rnd() * 40;
        x.fillRect(tx, h * (0.2 + rnd() * 0.3), tw, h);
      }
      x.fillRect(0, h * 0.82, w, h * 0.18);
    } else {
      // Силуэты крыш города с окнами
      let bx = 0;
      while (bx < w) {
        const bw = 90 + rnd() * 160,
          bh = h * (0.2 + rnd() * 0.3);
        x.fillStyle = c2;
        x.fillRect(bx, h - bh, bw, bh);
        x.fillStyle = c3;
        for (let k = 0; k < 8; k++)
          x.fillRect(
            bx + 10 + rnd() * (bw - 30),
            h - bh + 20 + rnd() * (bh - 40),
            12,
            18,
          );
        bx += bw + 6;
      }
    }
  }
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("canvas"))), "image/jpeg", 0.9),
  );
  return new File([blob], `${seed}.jpg`, { type: "image/jpeg" });
}

// ---------- Генерация музыки: аккорды + бочка на каждую долю, WAV ----------
function makeSynthTrack(
  bpm: number,
  mode: "major" | "minor",
  seconds = 45,
): File {
  const sr = 22050,
    n = sr * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);

  const third = mode === "major" ? 4 : 3; // большая или малая терция
  // Последовательность аккордов (ступени в полутонах от ля), по такту на аккорд
  const roots = mode === "major" ? [0, 5, 7, 5] : [0, 8, 3, 10];
  const beat = 60 / bpm;
  const f = (semi: number) => 220 * 2 ** (semi / 12);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bar = Math.floor(t / (beat * 4)) % roots.length;
    const r = roots[bar];
    const pad =
      [0, third, 7].reduce(
        (s, iv) => s + Math.sin(2 * Math.PI * f(r + iv) * t),
        0,
      ) / 3;
    const ph = t % beat;
    const kick =
      Math.exp(-ph * 28) *
      Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-ph * 40)) * ph);
    // Арпеджио восьмыми — даёт мелодию
    const eighth = Math.floor(t / (beat / 2)) % 3;
    const note = [0, third, 7][eighth] + 12;
    const arp =
      Math.sin(2 * Math.PI * f(r + note) * t) * Math.exp(-(t % (beat / 2)) * 6);
    const s = 0.22 * pad + 0.6 * kick + 0.18 * arp;
    v.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, s)) * 30000),
      true,
    );
  }
  return new File([buf], `demo-${bpm}-${mode}.wav`, { type: "audio/wav" });
}

async function fetchFile(url: string, name: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Нет файла ${url}`);
  const b = await r.blob();
  return new File([b], name, { type: b.type });
}

// Загрузить все демо-дни в архив. Возвращает число добавленных дней.
export async function seedDemoDays(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const r = await fetch("/demo/days.json");
  if (!r.ok) throw new Error("Не удалось загрузить список демо-дней");
  const { days } = (await r.json()) as { days: DemoDay[] };
  let added = 0;
  for (const d of days) {
    // Демо-день с постоянным id: прямая ссылка /day/demo-… работает у любого человека
    if (await getDay(`demo-${d.id}`)) { added++; onProgress?.(added, days.length); continue; }
    try {
      const photos = d.photos?.length
        ? await Promise.all(
            d.photos.map((p, k) => fetchFile(p, `${d.id}-${k}.jpg`)),
          )
        : await Promise.all(
            (d.palettes ?? [["#888888", "#333333", "#dddddd"]]).map((p, k) =>
              makeScenePhoto(d.scene, p, `${d.id}-${k}`),
            ),
          );

      const meta: SongMeta = { ...d.meta };
      let song: Parameters<typeof buildDay>[0]["song"];
      if (d.song.file)
        song = {
          kind: "file",
          file: await fetchFile(d.song.file, `${d.id}.mp3`),
          meta,
        };
      else if (d.song.url) song = { kind: "link", url: d.song.url, meta };
      else {
        const synth = d.song.synth ?? { bpm: 100, mode: "major" as const };
        // Темп и лад у сгенерированного трека известны точно — передаём их анализу
        song = {
          kind: "file",
          file: makeSynthTrack(synth.bpm, synth.mode),
          meta: { ...meta, bpm: synth.bpm, mode: synth.mode },
        };
      }

      await buildDay(
        {
          text: d.text,
          photos,
          song,
          checkIn: d.checkIn,
          consent: false,
          createdAt: new Date(d.date).toISOString(),
          id: `demo-${d.id}`,
          physio: d.physio ? demoPulse(d.physio) : undefined,
          demo: true,
        },
        () => undefined,
      );
      added++;
    } catch (e) {
      console.warn(`Демо-день ${d.id} пропущен:`, e);
    }
    onProgress?.(added, days.length);
  }
  markSeeded();
  return added;
}
