// Общий «договор» данных проекта (раздел 5 ТЗ).
// Все модули обмениваются только этими типами. Менять поля — только вместе с фикстурами.
import { z } from "zod";

const unit = z.number().min(0).max(1); // число 0..1
const scale5 = z.number().int().min(1).max(5); // шкала 1..5

export const EMOTIONS = [
  "joy",
  "nostalgia",
  "calm",
  "tenderness",
  "excitement",
  "pride",
  "gratitude",
  "wonder",
  "melancholy",
  "loneliness",
  "tension",
  "fatigue",
] as const;
export const EmotionSchema = z.enum(EMOTIONS);
export type Emotion = z.infer<typeof EmotionSchema>;

// Русские подписи эмоций для интерфейса
export const EMOTION_LABELS: Record<Emotion, string> = {
  joy: "радость",
  nostalgia: "ностальгия",
  calm: "спокойствие",
  tenderness: "нежность",
  excitement: "воодушевление",
  pride: "гордость",
  gratitude: "благодарность",
  wonder: "удивление",
  melancholy: "грусть",
  loneliness: "одиночество",
  tension: "напряжение",
  fatigue: "усталость",
};

export const CheckInSchema = z.object({
  intensity: scale5,
  emotions: z.array(EmotionSchema).max(3),
  tension: scale5,
  satisfaction: scale5,
  wouldRelive: scale5,
});
export type CheckIn = z.infer<typeof CheckInSchema>;

export const PhotoSpecSchema = z.object({
  count: z.number().int().min(0),
  palette: z
    .array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), share: unit }))
    .min(1)
    .max(5),
  brightness: unit,
  contrast: unit,
  warmth: unit,
  saturation: unit,
  visionNotes: z.object({ light: z.string(), scene: z.string() }).optional(),
});
export type PhotoSpec = z.infer<typeof PhotoSpecSchema>;

export const AudioSpecSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  year: z.number().int().optional(),
  genre: z.string().optional(),
  bpm: z.number().min(30).max(250),
  bpmConfidence: unit,
  energy: unit,
  brightness: unit,
  mode: z.enum(["major", "minor", "unknown"]),
  source: z.enum(["file", "link", "generated"]), // generated — саундтрек, сочинённый системой в браузере
  estimated: z.boolean(),
  embedUrl: z.string().optional(),
});
export type AudioSpec = z.infer<typeof AudioSpecSchema>;

export const PhysioContextSchema = z.object({
  kind: z.enum(["demo", "import"]),
  restHr: z.number().optional(), // пульс покоя (если известен)
  avgHr: z.number(),
  maxHr: z.number(),
  series: z.array(z.object({ t: z.number(), hr: z.number() })).max(48),
});
export type PhysioContext = z.infer<typeof PhysioContextSchema>;

export const MoodSpecSchema = z.object({
  version: z.literal(1),
  emotions: z
    .array(z.object({ emotion: EmotionSchema, weight: unit }))
    .min(1)
    .max(3),
  primary: EmotionSchema,
  secondary: EmotionSchema.optional(),
  valence: z.number().min(-1).max(1),
  energy: unit,
  tension: unit,
  warmth: unit,
  atmosphere: z.string().min(1),
  timeOfDay: z.enum(["morning", "day", "evening", "night", "mixed"]),
  season: z.enum(["winter", "spring", "summer", "autumn", "unknown"]),
  setting: z.array(z.string()),
  people: z.array(z.string()),
  keywords: z.array(z.string()).min(3).max(8),
  title: z.string().refine((t) => {
    const n = t.trim().split(/\s+/).length;
    return n >= 3 && n <= 7;
  }, "Название должно быть 3–7 слов"),
  narrationTone: z.enum([
    "calm-warm",
    "bright-fast",
    "cool-precise",
    "soft-quiet",
  ]),
  contradiction: z.object({ present: z.boolean(), note: z.string() }),
  confidence: unit,
  source: z.enum(["llm", "fallback"]),
  fusionNotes: z.array(z.string()),
});
export type MoodSpec = z.infer<typeof MoodSpecSchema>;

export const ReasonSchema = z.object({
  signal: z.string(),
  effect: z.string(),
  why: z.string(),
  from: z.array(z.enum(["text", "photo", "music", "checkin", "physio"])).min(1),
});
export type Reason = z.infer<typeof ReasonSchema>;

export const StyleParamsSchema = z.object({
  palette: z.array(z.string()).min(5).max(6),
  grade: z.object({
    hueShift: z.number(),
    saturation: z.number(),
    contrast: z.number(),
  }),
  weights: z.object({ paint: unit, geometry: unit, film: unit }),
  camera: z.object({
    zoomFrom: z.number(),
    zoomTo: z.number(),
    panAmp: z.number(),
    shakeAmp: z.number(),
  }),
  timeline: z.object({
    duration: z.number(),
    beatsPerCut: z.number(),
    cutInterval: z.number(),
    transition: z.enum(["crossfade", "cut", "stroke-reveal"]),
    cuts: z.array(z.number()),
  }),
  grain: unit,
  glow: unit,
  vignette: unit,
  doubleExposure: unit,
  negativeSpace: unit,
  strokes: z.object({ length: unit, curvature: unit, density: unit }),
  shapes: z.object({ density: unit, angularity: unit }),
  typography: z.object({ weight: z.number(), tracking: z.number() }),
  physioLine: z.boolean(),
  reasons: z.array(ReasonSchema),
});
export type StyleParams = z.infer<typeof StyleParamsSchema>;

// Запись дня в IndexedDB. Blob (файлы) zod не проверяет — это делает форма.
export interface DayRecord {
  id: string;
  createdAt: string;
  title: string;
  input: {
    text: string;
    photos: Blob[];
    songFile?: Blob;
    songUrl?: string;
    checkIn?: CheckIn;
    physio?: PhysioContext;
  };
  mood: MoodSpec;
  photo: PhotoSpec;
  audio: AudioSpec;
  style: StyleParams;
  voice?: Blob;
  poster?: Blob;
  demo?: boolean; // встроенный пример, а не запись пользователя
}

// Ограничить число диапазоном (по умолчанию 0..1)
export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));
