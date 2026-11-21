// Анализ музыки (раздел 8.5 ТЗ).
// Файл: декодируем в браузере, считаем темп (BPM), энергию (громкость) и «яркость» звука.
// Ссылка: аудио не скачиваем — темп и энергию оцениваем по жанру, году и характеру, который указал пользователь.
import { clamp, type AudioSpec } from "../schema";

export type SongMood = "calm" | "medium" | "energetic" | "";

export interface SongMeta {
  title?: string;
  artist?: string;
  year?: number;
  genre?: string;
  mood?: SongMood;
  bpm?: number; // известный темп (например, у сгенерированного демо-трека)
  mode?: "major" | "minor"; // известный лад
}

// Анализируем отрезок из середины песни (там обычно припев, а не тихое вступление)
const SEGMENT = 30;

export async function analyzeAudioFile(
  file: Blob,
  meta: SongMeta = {},
): Promise<AudioSpec> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const offset = Math.max(0, buffer.duration / 2 - SEGMENT / 2);
    const duration = Math.min(SEGMENT, buffer.duration - offset);

    // Темп: библиотека web-audio-beat-detector. Если не смогла — ставим 100 и низкую уверенность
    let bpm = 100;
    let bpmConfidence = 0.2;
    try {
      const { guess } = await import("web-audio-beat-detector");
      const res = await guess(buffer, offset, duration, {
        minTempo: 70,
        maxTempo: 170,
      });
      bpm = res.bpm;
      bpmConfidence = 0.8;
    } catch {
      /* тихая или очень неровная запись — оставляем запасные значения */
    }
    // Если темп известен заранее (указан пользователем или у демо-трека) — он точнее детектора
    if (meta.bpm) {
      bpm = meta.bpm;
      bpmConfidence = 1;
    }

    // Энергия (RMS) и «яркость» (доля пересечений нуля — чем выше, тем звонче звук)
    const data = buffer.getChannelData(0);
    const start = Math.floor(offset * buffer.sampleRate);
    const end = Math.min(
      data.length,
      start + Math.floor(duration * buffer.sampleRate),
    );
    let sq = 0,
      zc = 0;
    for (let i = start + 1; i < end; i++) {
      sq += data[i] * data[i];
      if (data[i] >= 0 !== data[i - 1] >= 0) zc++;
    }
    const len = Math.max(1, end - start);
    const rms = Math.sqrt(sq / len);
    const zcr = zc / len;

    const loudness = clamp((rms - 0.04) / 0.22); // тихая запись ≈0.05, громкий мастеринг ≈0.25
    const tempoNorm = clamp((bpm - 60) / 110);
    return {
      title: meta.title,
      artist: meta.artist,
      year: meta.year,
      genre: meta.genre,
      bpm: Math.round(bpm),
      bpmConfidence,
      energy: +clamp(0.65 * loudness + 0.35 * tempoNorm).toFixed(2),
      brightness: +clamp(zcr / 0.12).toFixed(2),
      mode: meta.mode ?? "unknown", // лад надёжно без ИИ не определить — без подсказки ставим «неизвестно»
      source: "file",
      estimated: bpmConfidence < 0.5,
    };
  } finally {
    ctx.close();
  }
}

// Оценка по жанру: [темп, энергия, яркость]
const GENRES: [RegExp, number, number, number][] = [
  [
    /электро|electro|techno|техно|house|хаус|edm|trance|транс|drum|dnb|dubstep/i,
    126,
    0.85,
    0.75,
  ],
  [/рок|rock|metal|метал|панк|punk/i, 125, 0.8, 0.7],
  [/хип|hip|рэп|рэп|rap|trap|трэп/i, 90, 0.7, 0.6],
  [/поп|pop|k-pop|dance|данс/i, 115, 0.65, 0.65],
  [/инди|indie|альтерн|alternative/i, 110, 0.55, 0.55],
  [/джаз|jazz|блюз|blues|soul|соул/i, 96, 0.45, 0.45],
  [/фолк|folk|акуст|acoustic|кантри|country/i, 95, 0.4, 0.45],
  [/lo-?fi|лоу|chill|чил/i, 80, 0.3, 0.35],
  [
    /класс|classic|фортеп|piano|пиано|ambient|эмбиент|оркестр|orchestra|саундтрек|soundtrack/i,
    70,
    0.25,
    0.4,
  ],
  [/ретро|retro|шансон|эстрад|romance|романс|oldies/i, 100, 0.45, 0.45],
];

const MOOD_ADJUST: Record<Exclude<SongMood, "">, [number, number]> = {
  calm: [72, 0.25],
  medium: [105, 0.5],
  energetic: [132, 0.82],
};

export function estimateAudioFromMeta(
  meta: SongMeta,
  embedUrl?: string,
): AudioSpec {
  let bpm = 100,
    energy = 0.5,
    brightness = 0.5,
    confidence = 0.15;
  const text = `${meta.genre ?? ""} ${meta.title ?? ""} ${meta.artist ?? ""}`;
  const g = GENRES.find(([re]) => re.test(text));
  if (g) {
    [, bpm, energy, brightness] = g;
    confidence = 0.3;
  }
  // Характер песни от пользователя важнее жанра
  if (meta.mood) {
    const [mb, me] = MOOD_ADJUST[meta.mood];
    bpm = g ? Math.round((bpm + mb * 2) / 3) : mb;
    energy = g ? (energy + me * 2) / 3 : me;
    confidence = 0.4;
  }
  return {
    title: meta.title,
    artist: meta.artist,
    year: meta.year,
    genre: meta.genre,
    bpm: Math.round(bpm),
    bpmConfidence: confidence,
    energy: +clamp(energy).toFixed(2),
    brightness: +clamp(brightness).toFixed(2),
    mode: meta.mode ?? "unknown",
    source: "link",
    estimated: true,
    embedUrl,
  };
}
