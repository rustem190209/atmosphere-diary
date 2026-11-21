// Проверка fuse и mapToStyle: 4 кейса слияния + разные веса техник + влияние темпа.
// Запуск (PowerShell): npm run check:style
import {
  StyleParamsSchema,
  MoodSpecSchema,
  type AudioSpec,
  type PhotoSpec,
} from "../src/lib/schema";
import { MOOD_FIXTURES } from "../src/lib/fixtures/moods";
import { fuse } from "../src/lib/fusion/fuse";
import { mapToStyle } from "../src/lib/style/mapToStyle";

let fails = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} ${info}`);
};

const warmPhoto: PhotoSpec = {
  count: 3,
  brightness: 0.6,
  contrast: 0.5,
  warmth: 0.75,
  saturation: 0.5,
  palette: [
    { hex: "#c98a3e", share: 0.3 },
    { hex: "#7a4a22", share: 0.25 },
    { hex: "#e8c48a", share: 0.2 },
    { hex: "#3b2a1c", share: 0.15 },
    { hex: "#a8b0a0", share: 0.1 },
  ],
};
const coldPhoto: PhotoSpec = {
  count: 3,
  brightness: 0.3,
  contrast: 0.7,
  warmth: 0.25,
  saturation: 0.3,
  palette: [
    { hex: "#1d2a3a", share: 0.35 },
    { hex: "#3c5a7a", share: 0.25 },
    { hex: "#8aa0b8", share: 0.2 },
    { hex: "#0c1018", share: 0.12 },
    { hex: "#d0d8e0", share: 0.08 },
  ],
};
const song = (bpm: number, energy: number, year?: number): AudioSpec => ({
  bpm,
  bpmConfidence: 0.8,
  energy,
  brightness: 0.5,
  mode: "unknown",
  source: "file",
  estimated: false,
  year,
});

// 1. Слияние: 4 кейса из ТЗ
const base = MOOD_FIXTURES.autumnPark;
const agree = fuse(base, {
  intensity: 3,
  emotions: ["joy"],
  tension: 1,
  satisfaction: 5,
  wouldRelive: 5,
});
check(
  "fuse: согласие",
  !agree.contradiction.present && MoodSpecSchema.safeParse(agree).success,
);
const contra = fuse(base, {
  intensity: 4,
  emotions: ["loneliness", "fatigue"],
  tension: 4,
  satisfaction: 1,
  wouldRelive: 2,
});
check(
  "fuse: противоречие",
  contra.contradiction.present && contra.confidence < base.confidence,
  `→ ${contra.atmosphere}`,
);
const noCheck = fuse(base);
check(
  "fuse: без чек-ина",
  noCheck.tension === base.tension && !noCheck.contradiction.present,
);
const withPhysio = fuse(base, undefined, {
  kind: "demo",
  avgHr: 78,
  maxHr: 120,
  series: [],
});
check(
  "fuse: с пульсом не меняет эмоции",
  JSON.stringify(withPhysio.emotions) === JSON.stringify(base.emotions),
);

// 2. Три фикстуры → три разных набора весов
const days = [
  [
    "autumnPark",
    mapToStyle(MOOD_FIXTURES.autumnPark, warmPhoto, song(82, 0.35, 1958)),
  ],
  [
    "officeNight",
    mapToStyle(MOOD_FIXTURES.officeNight, coldPhoto, song(128, 0.85)),
  ],
  [
    "rainyEvening",
    mapToStyle(MOOD_FIXTURES.rainyEvening, coldPhoto, song(68, 0.2)),
  ],
] as const;
for (const [name, s] of days) {
  const valid = StyleParamsSchema.safeParse(s).success;
  const music = s.reasons.some((r) => r.from.includes("music"));
  check(
    `style ${name}`,
    valid && s.reasons.length >= 4 && music,
    `| paint ${s.weights.paint} geo ${s.weights.geometry} film ${s.weights.film} | кадр ${s.timeline.cutInterval}с ${s.timeline.transition} | причин ${s.reasons.length}`,
  );
}
const leads = new Set(
  days.map(
    ([, s]) => Object.entries(s.weights).sort((a, b) => b[1] - a[1])[0][0],
  ),
);
check("3 дня — разные ведущие техники", leads.size >= 2, [...leads].join(", "));

// 3. Темп: одна запись с 70 и 150 BPM
const slow = mapToStyle(base, warmPhoto, song(70, 0.5));
const fast = mapToStyle(base, warmPhoto, song(150, 0.5));
check(
  "70 vs 150 BPM дают разный ритм",
  slow.timeline.cutInterval > fast.timeline.cutInterval * 1.5,
  `${slow.timeline.cutInterval}с vs ${fast.timeline.cutInterval}с`,
);

console.log(fails ? `\nОшибок: ${fails}` : "\nВсё прошло");
process.exit(fails ? 1 : 0);
