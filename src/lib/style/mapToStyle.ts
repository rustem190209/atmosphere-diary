// Cinematic Direction Engine (раздел 8.7 ТЗ): настроение + фото + музыка → параметры сцены и причины.
// Каждое решение записывается в reasons[] — их показывает панель «Почему так выглядит».
import {
  clamp,
  EMOTION_LABELS,
  type AudioSpec,
  type CheckIn,
  type MoodSpec,
  type PhotoSpec,
  type Reason,
  type StyleParams,
} from "../schema";
import { adjust, luminance } from "../color";

const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const weightOf = (m: MoodSpec, e: string) =>
  m.emotions.find((x) => x.emotion === e)?.weight ?? 0;

// «Старость» песни: до 1990 — старая, до 2005 — наполовину
function eraOld(audio: AudioSpec): number {
  if (!audio.year) return 0;
  return audio.year < 1990 ? 1 : audio.year < 2005 ? 0.5 : 0;
}

export function mapToStyle(
  mood: MoodSpec,
  photo: PhotoSpec,
  audio: AudioSpec,
  checkIn?: CheckIn,
  hasPhysio = false,
): StyleParams {
  const reasons: Reason[] = [];
  const add = (
    signal: string,
    effect: string,
    why: string,
    from: Reason["from"],
  ) => reasons.push({ signal, effect, why, from });

  // ---------- Нормализованные входы ----------
  const era = eraOld(audio);
  const N = clamp(weightOf(mood, "nostalgia") + 0.3 * era); // ностальгия
  const W = clamp(0.6 * mood.warmth + 0.4 * photo.warmth); // теплота: текст + фото
  const T = mood.tension;
  const V = mood.valence;
  const C = mood.contradiction.present ? 1 : 0;
  const E_m = checkIn
    ? clamp(
        0.5 * audio.energy +
          0.3 * mood.energy +
          0.2 * ((checkIn.intensity - 1) / 4),
      )
    : clamp((0.5 * audio.energy + 0.3 * mood.energy) / 0.8);

  // ---------- Веса техник ----------
  let paint = 0.45 * W + 0.3 * (1 - T) + 0.25 * (1 - E_m);
  let geometry = 0.5 * T + 0.3 * E_m + 0.2 * (1 - W);
  let film = 0.5 * N + 0.3 * C + 0.2 * era + 0.25 * weightOf(mood, "melancholy"); // грусть тоже немного «плёночная»
  // Усиливаем различия между днями: степень 1.5, затем нормируем
  [paint, geometry, film] = [paint, geometry, film].map(
    (v) => Math.max(0.05, v) ** 1.5,
  );
  const sum = paint + geometry + film;
  const weights = {
    paint: +(paint / sum).toFixed(2),
    geometry: +(geometry / sum).toFixed(2),
    film: 0,
  };
  weights.film = +(1 - weights.paint - weights.geometry).toFixed(2);

  const lead = (
    Object.entries(weights) as [keyof typeof weights, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];
  const leadWhy = {
    paint:
      "тёплый и спокойный день — мягкие мазки и размытый свет, как у Моне, передают покой",
    geometry:
      "напряжение и движение — резкие линии и контрастные формы, как у Кандинского, передают динамику",
    film: "память и прошлое — плёночное зерно и ореол ассоциируются с воспоминаниями",
  }[lead];
  add(
    `теплота ${pct(W)}, напряжение ${pct(T)}, динамика ${pct(E_m)}, ностальгия ${pct(N)}`,
    `живопись ${pct(weights.paint)}, геометрия ${pct(weights.geometry)}, плёнка ${pct(weights.film)}`,
    leadWhy,
    ["text", "photo", "music"],
  );

  // ---------- Ритм монтажа (от песни) ----------
  const beatsPerCut = Math.round(lerp(8, 2, E_m));
  const cutInterval = +clamp((beatsPerCut * 60) / audio.bpm, 1.0, 7.0).toFixed(
    2,
  );
  const songWord =
    audio.bpm < 85 ? "Медленная" : audio.bpm > 120 ? "Быстрая" : "Умеренная";
  const modeWord =
    audio.mode === "minor"
      ? " минорная"
      : audio.mode === "major"
        ? " мажорная"
        : "";
  add(
    `${songWord}${modeWord} песня (${audio.bpm} BPM${audio.estimated ? ", оценочно" : ""})`,
    `смена кадра каждые ${beatsPerCut} долей ≈ ${cutInterval.toFixed(1)} с`,
    audio.bpm < 85
      ? "медленный ритм даёт кадрам время, больше воздуха"
      : "кадры меняются в такт песне, монтаж «дышит» вместе с музыкой",
    ["music"],
  );

  // Песня и день по-разному энергичны — объясняем, кто за что отвечает
  if (Math.abs(audio.energy - mood.energy) > 0.3) {
    add(
      audio.energy < mood.energy
        ? "песня спокойнее дня"
        : "песня энергичнее дня",
      "ритм монтажа от песни, движение камеры смешивает песню и текст",
      "так слышно песню, но не теряется настроение записи",
      ["music", "text"],
    );
  }

  // ---------- Переход ----------
  const transition: StyleParams["timeline"]["transition"] =
    N > 0.5
      ? "stroke-reveal"
      : T > 0.6 && E_m > 0.5
        ? "cut"
        : E_m < 0.4
          ? "crossfade"
          : "crossfade";
  add(
    transition === "stroke-reveal"
      ? "ностальгия"
      : transition === "cut"
        ? "высокое напряжение и энергия"
        : "спокойный темп",
    transition === "stroke-reveal"
      ? "кадры проявляются мазками"
      : transition === "cut"
        ? "резкая склейка на бит"
        : "плавное растворение кадров",
    transition === "stroke-reveal"
      ? "воспоминание будто дорисовывается заново"
      : transition === "cut"
        ? "резкие переходы держат пульс дня"
        : "мягкая смена кадров не торопит",
    transition === "stroke-reveal" ? ["text"] : ["text", "music"],
  );

  // ---------- Камера ----------
  const zoomDelta = lerp(0.03, 0.12, E_m);
  const camera = {
    zoomFrom: 1,
    zoomTo: +(1 + zoomDelta).toFixed(3),
    panAmp: +lerp(0.01, 0.05, E_m).toFixed(3),
    shakeAmp: E_m > 0.75 ? +((E_m - 0.75) * 0.04).toFixed(4) : 0,
  };
  add(
    `динамика дня ${pct(E_m)}`,
    `приближение ${Math.round(zoomDelta * 100)}%${camera.shakeAmp ? ", лёгкая дрожь камеры" : ""}`,
    E_m > 0.6
      ? "быстрая камера передаёт насыщенность дня"
      : "медленное движение камеры — как взгляд, который задерживается",
    ["music", "text"],
  );

  // ---------- Палитра (основа — фото) ----------
  const hueShift = +((W - 0.5) * 24).toFixed(1);
  let satMul = 0.8 + 0.4 * ((V + 1) / 2);
  if (audio.mode === "minor") satMul *= 0.9;
  if (audio.energy < 0.35) satMul *= 0.92; // тихая песня приглушает цвета
  const base = photo.palette.map((p) => adjust(p.hex, hueShift, satMul));
  // 6-й цвет — глубокая тень для текста и рамки, из самого тёмного цвета фото
  const darkest = [...photo.palette].sort(
    (a, b) => luminance(a.hex) - luminance(b.hex),
  )[0].hex;
  const shadow = adjust(
    darkest,
    hueShift,
    0.6,
    -Math.max(0, luminance(darkest) - 0.12),
  );
  const palette = [...base, shadow].slice(0, 6);
  while (palette.length < 5)
    palette.push(adjust(palette[0], 30 * palette.length, 1)); // если фото однотонное
  add(
    `цвета фото (${photo.palette
      .slice(0, 3)
      .map((p) => p.hex)
      .join(", ")})`,
    `палитра из фото, оттенок сдвинут на ${hueShift > 0 ? "+" : ""}${hueShift}°, насыщенность ×${satMul.toFixed(2)}`,
    `${W > 0.55 ? "тёплый день уводит цвета к охре" : W < 0.45 ? "прохладный день уводит цвета к синему" : "нейтральная теплота сохраняет цвета фото"}; ${V > 0.2 ? "светлое настроение делает цвета ярче" : V < -0.2 ? "грусть приглушает цвета" : "настроение ровное"}`,
    ["photo", "text"],
  );
  if (audio.mode === "minor" || audio.energy < 0.35)
    add(
      "тихая или минорная песня",
      "цвета приглушены",
      "спокойная музыка не терпит кричащих цветов",
      ["music"],
    );

  // ---------- Зерно, свечение, виньетка ----------
  const grain = +clamp(0.1 + 0.5 * weights.film + 0.1 * N).toFixed(2);
  const glow = +clamp(0.6 * N + 0.3 * W).toFixed(2);
  const vignette = +clamp(0.2 + 0.5 * T).toFixed(2);
  add(
    era > 0 ? `старая песня (${audio.year})` : `ностальгия ${pct(N)}`,
    `зерно ${pct(grain)}, свечение ${pct(glow)}`,
    "зерно и мягкий ореол работают как старая фотография — ощущение памяти",
    era > 0 ? ["music", "text"] : ["text"],
  );
  if (T > 0.5)
    add(
      `напряжение ${pct(T)}`,
      `виньетка ${pct(vignette)}`,
      "тёмные края сужают взгляд, как при концентрации",
      ["text"],
    );

  // ---------- Двойная экспозиция ----------
  const doubleExposure = C ? 0.6 : 0;
  if (C)
    add(
      "текст и чек-ин расходятся",
      "двойная экспозиция: два кадра наложены друг на друга",
      "два слоя в одном кадре показывают два чувства одновременно",
      ["text", "checkin"],
    );

  // ---------- Свободное пространство ----------
  const negativeSpace = +clamp(
    0.5 * weightOf(mood, "melancholy") +
      0.4 * weightOf(mood, "loneliness") +
      0.3 * (1 - E_m) -
      0.1,
  ).toFixed(2);
  if (negativeSpace > 0.3)
    add(
      `${EMOTION_LABELS[mood.primary]}, низкая динамика`,
      `больше пустого пространства вокруг фото (${pct(negativeSpace)})`,
      "воздух вокруг кадра даёт паузу и тишину, как в японской графике",
      ["text", "music"],
    );

  // ---------- Мазки, фигуры, шрифт ----------
  const strokes = {
    length: +clamp(0.3 + 0.7 * (1 - E_m)).toFixed(2),
    curvature: +clamp(0.2 + 0.8 * (1 - T)).toFixed(2),
    density: +clamp(0.3 + 0.7 * W).toFixed(2),
  };
  const shapes = {
    density: +clamp(0.2 + 0.8 * E_m).toFixed(2),
    angularity: +clamp(T).toFixed(2),
  };
  const typography = {
    weight: Math.round(300 + 400 * T),
    tracking: +lerp(0.12, 0.02, E_m).toFixed(3),
  };
  add(
    `напряжение ${pct(T)}`,
    `${T > 0.5 ? "угловатые фигуры, плотный шрифт" : "округлые формы, лёгкий шрифт"} (толщина ${typography.weight})`,
    T > 0.5
      ? "острые углы и жирный шрифт звучат собранно и жёстко"
      : "мягкие формы и тонкие линии звучат спокойно",
    ["text"],
  );

  // ---------- Таймлайн ----------
  const duration = Math.round(
    clamp(cutInterval * Math.max(4, photo.count * 2) + 2, 20, 30),
  );
  const cuts: number[] = [];
  for (let t = 0; t < duration - 2 - 0.5; t += cutInterval)
    cuts.push(+t.toFixed(2));

  if (hasPhysio)
    add(
      "пульс дня",
      "тонкая линия ритма дня",
      "это контекст, а не оценка — пульс не меняет эмоции",
      ["physio"],
    );

  return {
    palette,
    grade: {
      hueShift,
      saturation: +satMul.toFixed(2),
      contrast: +(0.9 + 0.3 * T).toFixed(2),
    },
    weights,
    camera,
    timeline: { duration, beatsPerCut, cutInterval, transition, cuts },
    grain,
    glow,
    vignette,
    doubleExposure,
    negativeSpace,
    strokes,
    shapes,
    typography,
    physioLine: hasPhysio,
    reasons,
  };
}
