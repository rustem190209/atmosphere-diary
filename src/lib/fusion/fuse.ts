// Слияние анализа текста с чек-ином и пульсом в итоговый MoodSpec (раздел 8.6 ТЗ).
// Правила детерминированы: одинаковый ввод всегда даёт одинаковый результат.
import {
  clamp,
  EMOTION_LABELS,
  type CheckIn,
  type Emotion,
  type MoodSpec,
  type PhysioContext,
} from "../schema";
import { EMOTION_DIMS } from "../analyze/fallback";

const norm5 = (v: number) => (v - 1) / 4; // шкала 1..5 → 0..1

// Насколько светлым ощущался день по чек-ину: удовлетворённость + выбранные эмоции
export function checkInValence(c: CheckIn): number {
  const sat = (c.satisfaction - 3) / 2; // -1..1
  if (c.emotions.length === 0) return sat;
  const emo =
    c.emotions.reduce((s, e) => s + EMOTION_DIMS[e][0], 0) / c.emotions.length;
  return clamp(0.5 * sat + 0.5 * emo, -1, 1);
}

export function fuse(
  text: MoodSpec,
  checkIn?: CheckIn,
  physio?: PhysioContext,
): MoodSpec {
  const notes = [...text.fusionNotes];
  const mood: MoodSpec = {
    ...text,
    fusionNotes: notes,
    contradiction: { ...text.contradiction },
  };

  if (checkIn) {
    // Напряжение и энергия: 60% текст + 40% чек-ин
    mood.tension = +clamp(
      0.6 * text.tension + 0.4 * norm5(checkIn.tension),
    ).toFixed(2);
    mood.energy = +clamp(
      0.6 * text.energy + 0.4 * norm5(checkIn.intensity),
    ).toFixed(2);
    notes.push(
      `Напряжение и насыщенность дня: 60% из текста, 40% из чек-ина (${checkIn.tension}/5 и ${checkIn.intensity}/5)`,
    );

    // Эмоции: веса из текста ×0.6 + выбранные в чек-ине по 0.4/n
    const w = new Map<Emotion, number>();
    for (const e of text.emotions) w.set(e.emotion, e.weight * 0.6);
    for (const e of checkIn.emotions)
      w.set(e, (w.get(e) ?? 0) + 0.4 / checkIn.emotions.length);
    const top = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
    mood.emotions = top.map(([emotion, v]) => ({
      emotion,
      weight: +(v / sum).toFixed(2),
    }));
    mood.primary = mood.emotions[0].emotion;
    mood.secondary = mood.emotions[1]?.emotion;
    if (checkIn.emotions.length)
      notes.push(
        `Эмоции из чек-ина добавлены к тексту: ${checkIn.emotions.map((e) => EMOTION_LABELS[e]).join(", ")}`,
      );

    // Противоречие: текст и чек-ин расходятся по «светлости» больше чем на 0.5
    const vc = checkInValence(checkIn);
    if (Math.abs(text.valence - vc) > 0.5) {
      mood.contradiction = {
        present: true,
        note:
          text.valence > vc
            ? "В тексте день светлее, чем по ощущениям"
            : "По ощущениям день светлее, чем в тексте",
      };
      mood.atmosphere =
        text.valence * vc < 0
          ? "горько-сладкая"
          : `контраст: ${text.atmosphere}`;
      mood.confidence = +clamp(text.confidence - 0.15).toFixed(2);
      notes.push(
        `Текст и чек-ин расходятся (${text.valence.toFixed(1)} против ${vc.toFixed(1)}) — это не ошибка, а два чувства сразу`,
      );
    }
    mood.valence = +clamp(0.6 * text.valence + 0.4 * vc, -1, 1).toFixed(2);

    if (checkIn.wouldRelive >= 4)
      notes.push(`«Хотел бы пережить снова» — ${checkIn.wouldRelive}/5`);
  }

  // Пульс не меняет эмоции: только добавляет «линию ритма дня» в оформление
  if (physio)
    notes.push(
      `Пульс дня (в среднем ${Math.round(physio.avgHr)} уд/мин) рисуется тонкой линией и не влияет на оценку эмоций`,
    );

  return mood;
}
