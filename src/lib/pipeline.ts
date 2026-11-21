// Полный путь дня: ввод → анализ (текст, фото, музыка) → слияние → стиль → постер → сохранение.
import type { AudioSpec, CheckIn, DayRecord, MoodSpec } from "./schema";
import { MoodSpecSchema } from "./schema";
import { analyzePhotos, resizeImage } from "./photo/analyze";
import {
  analyzeAudioFile,
  estimateAudioFromMeta,
  type SongMeta,
} from "./audio/analyze";
import { analyzeTextFallback } from "./analyze/fallback";
import { fuse } from "./fusion/fuse";
import { mapToStyle } from "./style/mapToStyle";
import { prepareScene, renderPoster } from "./render/engine";
import { newDayId, saveDay } from "./storage/db";

export interface DayInput {
  text: string;
  photos: File[];
  song:
    | { kind: "file"; file: File; meta: SongMeta }
    | { kind: "link"; url: string; meta: SongMeta };
  checkIn?: CheckIn;
  consent: boolean;
  createdAt?: string; // дата дня (для демо-дней — в прошлом)
  demo?: boolean;
}

export type Step = "text" | "photo" | "music" | "draw" | "save";

// Анализ текста: через сервер (если есть согласие), при любой ошибке — локально, тем же словарём
async function analyzeText(text: string, consent: boolean): Promise<MoodSpec> {
  if (consent) {
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const parsed = MoodSpecSchema.safeParse(await r.json());
        if (parsed.success) return parsed.data;
      }
    } catch {
      /* сеть недоступна — ниже локальный анализ */
    }
  }
  return analyzeTextFallback({ text });
}

async function songMetaFromLink(
  url: string,
): Promise<{ title?: string; artist?: string; embedUrl?: string }> {
  try {
    const r = await fetch("/api/song-meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(7000),
    });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

export async function buildDay(
  input: DayInput,
  onStep: (s: Step) => void,
): Promise<DayRecord> {
  onStep("text");
  const textMood = await analyzeText(input.text, input.consent);

  onStep("photo");
  // Для показа храним фото до 1440 px (хватает для кадра 952×1190), для анализа хватает 768 px
  const photos = await Promise.all(
    input.photos.map((f) => resizeImage(f, 1440)),
  );
  const small = await Promise.all(photos.map((f) => resizeImage(f, 768, 0.8)));
  const photo = await analyzePhotos(small);

  onStep("music");
  let audio: AudioSpec;
  let songFile: Blob | undefined;
  let songUrl: string | undefined;
  if (input.song.kind === "file") {
    songFile = input.song.file;
    const meta = {
      ...input.song.meta,
      title:
        input.song.meta.title || input.song.file.name.replace(/\.[^.]+$/, ""),
    };
    try {
      audio = await analyzeAudioFile(input.song.file, meta);
    } catch {
      // Файл не удалось декодировать — оцениваем по описанию, но музыку всё равно сохраним
      audio = { ...estimateAudioFromMeta(meta), source: "file" };
    }
  } else {
    songUrl = input.song.url;
    const fetched = await songMetaFromLink(input.song.url);
    const meta = {
      ...input.song.meta,
      title: input.song.meta.title || fetched.title,
      artist: input.song.meta.artist || fetched.artist,
    };
    audio = estimateAudioFromMeta(meta, fetched.embedUrl);
  }

  onStep("draw");
  const mood = fuse(textMood, input.checkIn);
  const style = mapToStyle(mood, photo, audio, input.checkIn);
  const day: DayRecord = {
    id: newDayId(input.createdAt),
    createdAt: input.createdAt ?? new Date().toISOString(),
    demo: input.demo,
    title: mood.title,
    input: {
      text: input.text,
      photos,
      songFile,
      songUrl,
      checkIn: input.checkIn,
    },
    mood,
    photo,
    audio,
    style,
  };
  const scene = await prepareScene(day);
  day.poster = await renderPoster(scene);
  scene.images.forEach((b) => b.close());

  onStep("save");
  await saveDay(day);
  return day;
}
