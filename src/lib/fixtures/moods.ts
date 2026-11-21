// Три эталонных MoodSpec для разработки рендерера и mapToStyle (этап S1).
// Тексты вымышленные, по мотивам примеров из брифа.
import type { MoodSpec } from "../schema";

export const autumnPark: MoodSpec = {
  version: 1,
  emotions: [
    { emotion: "nostalgia", weight: 0.5 },
    { emotion: "joy", weight: 0.3 },
    { emotion: "tenderness", weight: 0.2 },
  ],
  primary: "nostalgia",
  secondary: "joy",
  valence: 0.5,
  energy: 0.3,
  tension: 0.15,
  warmth: 0.8,
  atmosphere: "тёплая осень",
  timeOfDay: "day",
  season: "autumn",
  setting: ["парк"],
  people: ["друг"],
  keywords: ["листья", "какао", "разговор", "холод"],
  title: "Осенний парк и какао",
  narrationTone: "calm-warm",
  contradiction: { present: false, note: "" },
  confidence: 0.8,
  source: "fallback",
  fusionNotes: [],
};

export const officeNight: MoodSpec = {
  version: 1,
  emotions: [
    { emotion: "tension", weight: 0.6 },
    { emotion: "fatigue", weight: 0.25 },
    { emotion: "pride", weight: 0.15 },
  ],
  primary: "tension",
  secondary: "fatigue",
  valence: -0.2,
  energy: 0.8,
  tension: 0.85,
  warmth: 0.2,
  atmosphere: "холодный фокус",
  timeOfDay: "night",
  season: "unknown",
  setting: ["офис"],
  people: ["команда"],
  keywords: ["дедлайн", "ноутбук", "кофе", "экран"],
  title: "Ночь в офисе перед сдачей",
  narrationTone: "cool-precise",
  contradiction: { present: false, note: "" },
  confidence: 0.8,
  source: "fallback",
  fusionNotes: [],
};

export const rainyEvening: MoodSpec = {
  version: 1,
  emotions: [
    { emotion: "melancholy", weight: 0.55 },
    { emotion: "loneliness", weight: 0.3 },
    { emotion: "calm", weight: 0.15 },
  ],
  primary: "melancholy",
  secondary: "loneliness",
  valence: -0.4,
  energy: 0.15,
  tension: 0.3,
  warmth: 0.35,
  atmosphere: "тихая грусть",
  timeOfDay: "evening",
  season: "autumn",
  setting: ["дом", "окно"],
  people: [],
  keywords: ["дождь", "чай", "окно", "тишина"],
  title: "Дождливый вечер у окна",
  narrationTone: "soft-quiet",
  contradiction: { present: false, note: "" },
  confidence: 0.7,
  source: "fallback",
  fusionNotes: [],
};

export const MOOD_FIXTURES = { autumnPark, officeNight, rainyEvening };
