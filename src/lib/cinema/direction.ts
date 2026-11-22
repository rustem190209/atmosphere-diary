// Emotional-to-Cinematic Engine: эмоциональный профиль дня → режиссёрские решения.
// EmotionalProfile — что чувствовал человек; CinematicDirection — как это снять.
// Рендерер (src/lib/render) рисует сцену по StyleParams; CinematicDirection — их понятное описание,
// поэтому разные профили дают действительно разные сцены, а не разные подписи.
import { clamp, EMOTION_LABELS, type DayRecord, type Emotion } from "../schema";
import { motionEnergy } from "../render/cameraPlan";

export interface EmotionalProfile {
  primaryEmotion: Emotion;
  secondaryEmotions: Emotion[];
  emotionalIntensity: number; // 0..1
  energy: number;
  warmth: number;
  nostalgia: number;
  tension: number;
  atmosphere: string;
}

export type PresetId = "warm-nostalgia" | "impulse" | "quiet-contemplation";

export interface CinematicDirection {
  preset: PresetId;
  visualMood: string; // название пресета
  colorPalette: string[];
  cameraMovement: string;
  movementIntensity: number; // 0..1
  lighting: string;
  transitionStyle: string;
  filmGrain: number; // 0..1
  rhythm: string;
}

export const PRESETS: Record<PresetId, { name: string; idea: string }> = {
  "warm-nostalgia": {
    name: "Тёплая ностальгия",
    idea: "приглушённые тёплые цвета, медленная камера, мягкое зерно и плавные переходы",
  },
  impulse: {
    name: "Импульс",
    idea: "насыщенные цвета, динамичная камера, быстрый монтаж на бит",
  },
  "quiet-contemplation": {
    name: "Тихое созерцание",
    idea: "мягкий свет, минимум движения, сдержанная прохладная палитра и воздух вокруг кадра",
  },
};

export function emotionalProfile(day: DayRecord): EmotionalProfile {
  const m = day.mood;
  const top = Math.max(...m.emotions.map((e) => e.weight));
  const nost = m.emotions.find((e) => e.emotion === "nostalgia")?.weight ?? 0;
  const fromCheckIn = day.input.checkIn
    ? (day.input.checkIn.intensity - 1) / 4
    : undefined;
  const intensity = clamp(
    0.45 * m.energy + 0.3 * Math.abs(m.valence) + 0.25 * m.tension,
  );
  return {
    primaryEmotion: m.primary,
    secondaryEmotions: m.emotions
      .map((e) => e.emotion)
      .filter((e) => e !== m.primary),
    emotionalIntensity: +(
      fromCheckIn === undefined
        ? intensity
        : 0.5 * intensity + 0.5 * fromCheckIn
    ).toFixed(2),
    energy: m.energy,
    warmth: m.warmth,
    nostalgia: +clamp((nost / top) * 0.85).toFixed(2),
    tension: m.tension,
    atmosphere: m.atmosphere,
  };
}

export function cinematicDirection(
  day: DayRecord,
  p = emotionalProfile(day),
): CinematicDirection {
  const s = day.style;
  const E = motionEnergy(day);
  const preset: PresetId =
    p.nostalgia >= 0.5 || (p.warmth > 0.62 && E < 0.5)
      ? "warm-nostalgia"
      : E >= 0.55
        ? "impulse"
        : "quiet-contemplation";
  const cameraMovement =
    E < 0.35
      ? "Медленный наезд, почти неподвижный кадр"
      : E < 0.65
        ? "Плавный наезд и панорама по точкам интереса"
        : "Ручная камера, резкие наезды, удары на бит";
  const lighting =
    s.glow > 0.5
      ? "Тёплый засвет и мягкий ореол"
      : p.tension > 0.6
        ? "Контрастный, холодный, глубокие тени"
        : p.warmth < 0.45
          ? "Рассеянный, прохладный"
          : "Мягкий естественный свет";
  const transitionStyle =
    s.timeline.transition === "cut"
      ? "Жёсткая склейка на бит"
      : s.timeline.transition === "stroke-reveal"
        ? "Проявление кадра мазками"
        : "Медленное растворение";
  return {
    preset,
    visualMood: PRESETS[preset].name,
    colorPalette: s.palette,
    cameraMovement,
    movementIntensity: +E.toFixed(2),
    lighting,
    transitionStyle,
    filmGrain: s.grain,
    rhythm: `${day.audio.bpm} BPM · смена кадра ≈ ${s.timeline.cutInterval.toFixed(1)} с`,
  };
}

// ---------- Поэтичное описание дня (по правилам, без ИИ) ----------

const LINES: Record<Emotion, string> = {
  joy: "День, в котором хотелось остаться подольше.",
  nostalgia: "Всё было так, будто это уже воспоминание.",
  calm: "Ничего не нужно было догонять.",
  tenderness: "Тепло, которое долго остаётся в ладонях.",
  excitement: "Сердце билось быстрее музыки.",
  pride: "Шаг, который запомнится надолго.",
  gratitude: "Спасибо этому дню — за людей и за свет.",
  wonder: "Мир на минуту стал чуть больше.",
  melancholy: "Тишина, в которой слышно себя.",
  loneliness: "Одно окно, одна чашка, один долгий вечер.",
  tension: "Время сжималось до одной точки.",
  fatigue: "Усталость, за которой прячется смысл.",
  hope: "Впереди было что-то светлое.",
};

const TIME: Record<string, string> = {
  morning: "Утро",
  day: "День",
  evening: "Вечер",
  night: "Ночь",
  mixed: "День",
};
const SEASON: Record<string, [string, string, string]> = {
  // прилагательное для м., ж., ср. рода
  autumn: ["Осенний", "Осенняя", "Осеннее"],
  winter: ["Зимний", "Зимняя", "Зимнее"],
  spring: ["Весенний", "Весенняя", "Весеннее"],
  summer: ["Летний", "Летняя", "Летнее"],
};

export function poeticDescription(day: DayRecord): string {
  const m = day.mood;
  const timeWord = TIME[m.timeOfDay] ?? "День";
  const g = timeWord === "Ночь" ? 1 : timeWord === "Утро" ? 2 : 0;
  const season = SEASON[m.season]?.[g];
  const head = season ? `${season} ${timeWord.toLowerCase()}` : timeWord;
  const place = m.setting[0] ? `, ${m.setting[0]}` : "";
  const people = m.people.length
    ? `, рядом — ${m.people.slice(0, 2).join(" и ")}`
    : "";
  const first = `${head}${place}${people}.`;
  // Только существительные-детали: отбрасываем глаголы и прилагательные из частых слов
  const notNoun = /(ли|ла|ло|ть|ться|лся|лась|ем|ют|ет|ит|ый|ий|ая|ое|ые|ых|ого|ому)$/;
  const kw = m.keywords.filter((k) => !m.setting.includes(k) && !notNoun.test(k)).slice(0, 3);
  const second =
    kw.length >= 2
      ? `Запомнились ${kw.slice(0, -1).join(", ")} и ${kw[kw.length - 1]}.`
      : "";
  const third = LINES[m.primary];
  const fourth = m.contradiction.present
    ? "Снаружи — одно, внутри — другое."
    : "";
  return [first, second, third, fourth].filter(Boolean).join(" ");
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const emotionLabel = (e: Emotion) => EMOTION_LABELS[e];
