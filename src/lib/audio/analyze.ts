// Анализ музыки (раздел 8.5 ТЗ).
// Файл: декодируем в браузере, считаем темп (BPM), энергию (громкость) и «яркость» звука.
// Ссылка: аудио не скачиваем — темп и энергию оцениваем по жанру, году и характеру, который указал пользователь.
import { clamp, type AudioSpec } from "../schema";
import { detectTempo, type TempoResult } from "./tempo";

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

// Анализируем отрезки по 30 с из разных частей песни (не тихое вступление)
const SEGMENT = 30;

// Смешать каналы в моно (стерео-песня → один сигнал)
function monoMix(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++)
      out[i] += ch[i] / buffer.numberOfChannels;
  }
  return out;
}

// Медиана: устойчива к одному «сбившемуся» отрезку
function medianTempo(list: number[]): number {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Частая ошибка детекторов — темп вдвое больше или меньше настоящего.
// Если пользователь сказал, что песня спокойная или энергичная, поправляем «октаву» темпа.
function foldToMood(bpm: number, mood?: SongMood): number {
  if (mood === "calm" && bpm > 120 && bpm / 2 >= 55) return Math.round(bpm / 2);
  if (mood === "energetic" && bpm < 85 && bpm * 2 <= 190)
    return Math.round(bpm * 2);
  return Math.round(bpm);
}

export async function analyzeAudioFile(
  file: Blob,
  meta: SongMeta = {},
): Promise<AudioSpec> {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const offset = Math.max(0, buffer.duration / 2 - SEGMENT / 2);
    const duration = Math.min(SEGMENT, buffer.duration - offset);

    // Темп: свой детектор (tempo.ts) на трёх отрезках песни, берём медиану.
    // Если отрезки согласны и ритм чёткий — уверенность выше
    let bpm = 100;
    let bpmConfidence = 0.2;
    if (meta.bpm) {
      // Темп известен заранее (у демо-трека) — он точнее детектора
      bpm = meta.bpm;
      bpmConfidence = 1;
    } else {
      const mono = monoMix(buffer);
      const sr = buffer.sampleRate;
      const results: TempoResult[] = [];
      for (const part of buffer.duration > 60 ? [0.25, 0.5, 0.75] : [0.5]) {
        const from = Math.max(
          0,
          Math.floor((buffer.duration * part - SEGMENT / 2) * sr),
        );
        const r = detectTempo(
          mono.subarray(from, Math.min(mono.length, from + SEGMENT * sr)),
          sr,
        );
        if (r.confidence > 0) results.push(r);
      }
      if (results.length) {
        bpm = medianTempo(results.map((r) => r.bpm));
        const agree =
          results.filter((r) => Math.abs(r.bpm - bpm) / bpm < 0.04).length /
          results.length;
        const clarity =
          results.reduce((s, r) => s + r.confidence, 0) / results.length;
        bpmConfidence = +clamp(0.3 + 0.35 * agree + 0.3 * clarity).toFixed(2);
        bpm = foldToMood(bpm, meta.mood);
      }
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
