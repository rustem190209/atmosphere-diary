// src/lib/music/musicMatch.ts
// Music-Memory Matching: система САМА подбирает саундтрек по эмоциональному профилю дня
// и объясняет, почему. Чистые функции, без зависимостей, работают и в браузере, и на сервере.
//
// Как это устроено:
//   Profile (из слияния текста + опроса + пульса) → targetFor() → «желаемые параметры музыки»
//   → каждый кандидат получает оценку по 7 признакам → ранжирование → объяснение словами.
// Кандидаты: пресеты генеративного саундтрека (PRESETS), необязательный каталог треков
// (catalog.json команды) и песня пользователя (чтобы показать, насколько она совпала с днём).

export type Mode = "major" | "minor" | "mixed" | "unknown";

/** Эмоциональный профиль дня (результат слияния). Все числа 0..1, кроме valence (-1..1). */
export interface Profile {
  valence: number;
  energy: number;
  tension: number;
  warmth: number;
  nostalgia: number;
  contradiction?: boolean;
}

export interface Candidate {
  id: string;
  kind: "user-song" | "generated" | "catalog";
  title: string;
  artist?: string;
  bpm: number;
  mode: Mode;
  energy: number; // 0..1
  brightness: number; // 0..1 яркость тембра
  valence: number; // -1..1 музыкальный окрас
  tags: string[]; // piano, pad, pluck, drums, electronic, vintage, crackle
  year?: number;
  estimated?: boolean; // true, если параметры оценены, а не измерены
  url?: string;
  license?: string;
}

export interface Target {
  bpm: number;
  energy: number;
  brightness: number;
  valence: number;
  mode: Mode;
  vintage: number; // 0..1, чем выше — тем «старее» звучание
  tags: string[];
}

export interface Part {
  key: "tempo" | "energy" | "valence" | "mode" | "brightness" | "era" | "tags";
  score: number; // 0..1
  weight: number;
  note: string; // русское пояснение с числами
}

export interface Ranked {
  candidate: Candidate;
  score: number; // 0..1
  parts: Part[];
}

export interface Explanation {
  headline: string;
  agree: string[];
  contrast: string[];
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pct = (x: number) => Math.round(x * 100);

const WEIGHTS = { tempo: 0.2, energy: 0.2, valence: 0.16, mode: 0.12, brightness: 0.1, era: 0.06, tags: 0.16 };

/** Пресеты генеративного саундтрека: их играет genScore.ts прямо в браузере (без авторских прав). */
export const PRESETS: Candidate[] = [
  { id: "autumn-light", kind: "generated", title: "Осенний свет", bpm: 68, mode: "mixed", energy: 0.3, brightness: 0.45, valence: 0.2, tags: ["piano", "pad", "vintage"] },
  { id: "quiet-rain", kind: "generated", title: "Тихий дождь", bpm: 62, mode: "minor", energy: 0.18, brightness: 0.35, valence: -0.45, tags: ["piano", "pad"] },
  { id: "film-nostalgia", kind: "generated", title: "Ностальгия на плёнке", bpm: 74, mode: "mixed", energy: 0.3, brightness: 0.4, valence: 0.1, tags: ["vintage", "piano", "crackle"] },
  { id: "warm-evening", kind: "generated", title: "Тёплый вечер", bpm: 80, mode: "major", energy: 0.38, brightness: 0.55, valence: 0.5, tags: ["pluck", "pad"] },
  { id: "morning-light", kind: "generated", title: "Утренний свет", bpm: 92, mode: "major", energy: 0.5, brightness: 0.7, valence: 0.6, tags: ["pluck", "pad"] },
  { id: "friends-weekend", kind: "generated", title: "Выходной с друзьями", bpm: 118, mode: "major", energy: 0.75, brightness: 0.75, valence: 0.7, tags: ["pluck", "drums"] },
  { id: "celebration", kind: "generated", title: "Праздник", bpm: 124, mode: "major", energy: 0.85, brightness: 0.8, valence: 0.85, tags: ["pluck", "drums"] },
  { id: "night-city", kind: "generated", title: "Ночной город", bpm: 110, mode: "minor", energy: 0.7, brightness: 0.5, valence: -0.1, tags: ["electronic", "drums"] },
  { id: "deadline", kind: "generated", title: "Дедлайн", bpm: 128, mode: "minor", energy: 0.85, brightness: 0.45, valence: -0.25, tags: ["electronic", "drums"] },
  { id: "tense-quiet", kind: "generated", title: "Напряжённая тишина", bpm: 84, mode: "minor", energy: 0.45, brightness: 0.3, valence: -0.5, tags: ["pad", "electronic"] },
  { id: "tenderness", kind: "generated", title: "Нежность", bpm: 66, mode: "major", energy: 0.22, brightness: 0.5, valence: 0.45, tags: ["piano", "pad"] },
  { id: "lonely-evening", kind: "generated", title: "Одинокий вечер", bpm: 58, mode: "minor", energy: 0.15, brightness: 0.3, valence: -0.6, tags: ["piano", "pad"] },
];

/** Какую музыку «хочет» этот день. Формулы стартовые, подбираются на слух и на глаз. */
export function targetFor(p: Profile): Target {
  const energy = clamp(0.8 * p.energy + 0.2 * p.tension + 0.1 * Math.max(0, p.valence) * p.energy);
  const valence = clamp(0.75 * p.valence + 0.25 * (p.warmth * 2 - 1), -1, 1);
  let mode: Mode = valence > 0.25 ? "major" : valence < -0.15 ? "minor" : "mixed";
  if ((p.nostalgia > 0.55 && valence > -0.1) || p.contradiction) mode = "mixed";
  const tags: string[] = [];
  if (p.nostalgia > 0.5) tags.push("vintage", "crackle");
  if (energy < 0.35) tags.push("piano", "pad");
  else if (energy < 0.65) tags.push("pluck", "pad");
  else tags.push("drums");
  if (energy >= 0.65 && p.tension > 0.5) tags.push("electronic");
  return {
    bpm: Math.round(lerp(58, 138, energy)),
    energy,
    brightness: clamp(0.5 + 0.25 * valence + 0.15 * p.energy - 0.15 * p.nostalgia + 0.1 * (p.warmth - 0.5)),
    valence,
    mode,
    vintage: clamp(p.nostalgia),
    tags,
  };
}

function tempoSim(bpm: number, target: number): number {
  const d = (b: number) => Math.abs(Math.log2(b / target));
  const best = Math.min(d(bpm), d(bpm * 2) + 0.25, d(bpm / 2) + 0.25); // удвоенный/половинный темп допустим, но хуже
  return clamp(1 - best / 0.55);
}

function modeSim(target: Mode, cand: Mode): number {
  if (cand === "unknown") return 0.5;
  if (target === cand) return 1;
  if (target === "mixed" || cand === "mixed") return 0.6;
  return 0.2;
}

const modeRu = (m: Mode) => (m === "major" ? "мажор" : m === "minor" ? "минор" : m === "mixed" ? "смешанный (горько-сладкий) лад" : "лад неизвестен");
const valWord = (v: number) => (v > 0.25 ? "светлый" : v < -0.15 ? "тёмный" : "двойственный");

function buildParts(t: Target, c: Candidate): Part[] {
  const sEra = c.year ? 1 - Math.abs(clamp((2015 - c.year) / 55) - t.vintage) * 0.8 : 0.5;
  const matched = c.tags.filter((x) => t.tags.includes(x));
  const sTags = t.tags.length ? matched.length / t.tags.length : 0.5;
  return [
    { key: "tempo", weight: WEIGHTS.tempo, score: tempoSim(c.bpm, t.bpm), note: `темп ${c.bpm} BPM при желаемых ≈${t.bpm}` },
    { key: "energy", weight: WEIGHTS.energy, score: 1 - Math.abs(c.energy - t.energy), note: `энергия музыки ${pct(c.energy)}% при энергии дня ≈${pct(t.energy)}%` },
    { key: "valence", weight: WEIGHTS.valence, score: 1 - Math.abs(c.valence - t.valence) / 2, note: `окрас музыки «${valWord(c.valence)}», окрас дня «${valWord(t.valence)}»` },
    { key: "mode", weight: WEIGHTS.mode, score: modeSim(t.mode, c.mode), note: `лад: ${modeRu(c.mode)}; дню подходит: ${modeRu(t.mode)}` },
    { key: "brightness", weight: WEIGHTS.brightness, score: 1 - Math.abs(c.brightness - t.brightness), note: `яркость тембра ${pct(c.brightness)}% при желаемых ≈${pct(t.brightness)}%` },
    { key: "era", weight: WEIGHTS.era, score: sEra, note: c.year ? `эпоха ${c.year} г. и ностальгия дня (${pct(t.vintage)}%)` : "эпоха не указана" },
    { key: "tags", weight: WEIGHTS.tags, score: sTags, note: `характер звучания: ${matched.length ? matched.join(", ") : "совпадений нет"}` },
  ];
}

export function scoreOne(profile: Profile, c: Candidate): Ranked {
  const parts = buildParts(targetFor(profile), c);
  const score = parts.reduce((s, p) => s + p.score * p.weight, 0);
  return { candidate: c, score: clamp(score), parts };
}

export function rank(profile: Profile, pool: Candidate[]): Ranked[] {
  return pool.map((c) => scoreOne(profile, c)).sort((a, b) => b.score - a.score);
}

export interface MusicPick {
  target: Target;
  targetText: string;
  system: Ranked; // что подобрала система
  runnersUp: Ranked[]; // 2 запасных варианта
  user?: Ranked; // насколько совпала песня пользователя
}

export function describeTarget(t: Target): string {
  return `Для такого дня подходит: ≈${t.bpm} BPM, ${modeRu(t.mode)}, энергия ≈${pct(t.energy)}%, звучание: ${t.tags.join(", ") || "нейтральное"}`;
}

/** Главная функция: профиль → подобранный саундтрек (+ оценка песни пользователя, если она есть). */
export function pickMusic(profile: Profile, opts: { userSong?: Candidate; catalog?: Candidate[] } = {}): MusicPick {
  const target = targetFor(profile);
  const ranked = rank(profile, [...PRESETS, ...(opts.catalog ?? [])]);
  return {
    target,
    targetText: describeTarget(target),
    system: ranked[0],
    runnersUp: ranked.slice(1, 3),
    user: opts.userSong ? scoreOne(profile, opts.userSong) : undefined,
  };
}

/** Человеческое объяснение для панели «Почему так выглядит / почему эта музыка». */
export function explainMatch(r: Ranked, owner: "system" | "user"): Explanation {
  const who = owner === "system" ? "Система подобрала" : "Ваша песня";
  const headline = `${who} «${r.candidate.title}»: совпадение с профилем дня ${pct(r.score)}%${r.candidate.estimated ? " (параметры оценочные)" : ""}`;
  const agree = [...r.parts]
    .filter((p) => p.score >= 0.7)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((p) => p.note);
  const contrast: string[] = [];
  for (const p of r.parts) {
    if (p.score < 0.45 && p.key !== "era" && p.key !== "tags") contrast.push(p.note);
  }
  const energy = r.parts.find((p) => p.key === "energy");
  if (energy && energy.score < 0.55) {
    contrast.push("музыка и день расходятся по энергии: ритм монтажа берём от музыки, а мягкость или напряжение кадра — от текста и опроса");
  }
  return { headline, agree, contrast };
}
