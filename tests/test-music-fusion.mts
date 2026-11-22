import assert from "node:assert/strict";
import { pickMusic, explainMatch, PRESETS, scoreOne } from "../src/lib/music/musicMatch.ts";
import type { Profile, Candidate } from "../src/lib/music/musicMatch.ts";
import { fuse, demoPhysio } from "../src/lib/fusion/fusionV2.ts";
import type { TextEstimate, CheckIn } from "../src/lib/fusion/fusionV2.ts";

const days: Record<string, Profile> = {
  "1 Любимый день (горько-сладкий)": { valence: 0.35, energy: 0.35, tension: 0.3, warmth: 0.75, nostalgia: 0.8 },
  "2 Ночь перед дедлайном": { valence: -0.2, energy: 0.8, tension: 0.8, warmth: 0.2, nostalgia: 0.1 },
  "3 Выходной с друзьями": { valence: 0.8, energy: 0.85, tension: 0.15, warmth: 0.8, nostalgia: 0.2 },
  "4 Дождливый вечер дома": { valence: -0.5, energy: 0.15, tension: 0.3, warmth: 0.3, nostalgia: 0.4 },
  "5 Старые фото с бабушкой": { valence: 0.5, energy: 0.2, tension: 0.1, warmth: 0.85, nostalgia: 0.9 },
  "6 День экзамена (контраст)": { valence: 0.1, energy: 0.7, tension: 0.75, warmth: 0.4, nostalgia: 0.1, contradiction: true },
  "7 Праздничный вечер": { valence: 0.85, energy: 0.75, tension: 0.1, warmth: 0.9, nostalgia: 0.2 },
};

console.log("== Подбор музыки по профилю дня ==");
const picks = new Set<string>();
for (const [name, p] of Object.entries(days)) {
  const r = pickMusic(p);
  picks.add(r.system.candidate.id);
  console.log(`${name.padEnd(36)} → «${r.system.candidate.title}» ${Math.round(r.system.score * 100)}%  (цель: ${r.target.bpm} BPM, ${r.target.mode})`);
}
console.log("Разных пресетов выбрано:", picks.size, "из 7");
assert.ok(picks.size >= 5, "7 разных дней должны давать минимум 5 разных саундтреков");

// Чувствительность: тот же день, но энергия выросла — выбор должен измениться
const calm = pickMusic({ ...days["1 Любимый день (горько-сладкий)"] }).system.candidate.id;
const hot = pickMusic({ ...days["1 Любимый день (горько-сладкий)"], energy: 0.95, tension: 0.7 }).system.candidate.id;
console.log("Тот же день, энергия 0.35 → 0.95:", calm, "→", hot);
assert.notEqual(calm, hot);

// Песня пользователя: оценка совпадения и объяснение
const sinatraLike: Candidate = { id: "u1", kind: "user-song", title: "Песня пользователя (оценочно)", artist: "—", bpm: 84, mode: "major", energy: 0.3, brightness: 0.45, valence: 0.5, tags: ["vintage", "pad"], year: 1957, estimated: true };
const autumn = days["5 Старые фото с бабушкой"];
const fast: Candidate = { ...sinatraLike, id: "u2", bpm: 150, energy: 0.9, year: 2022, tags: ["electronic", "drums"], mode: "minor", valence: -0.2 };
const s1 = scoreOne(autumn, sinatraLike), s2 = scoreOne(autumn, fast);
console.log("\nПесня 1957 г. к дню «бабушка»:", Math.round(s1.score * 100) + "%;", "быстрая электроника:", Math.round(s2.score * 100) + "%");
assert.ok(s1.score > s2.score + 0.2);
console.log(JSON.stringify(explainMatch(s2, "user"), null, 1));

// Слияние
const textJoy: TextEstimate = { valence: 0.8, energy: 0.85, tension: 0.2, warmth: 0.8, nostalgia: 0.2, confidence: 0.7, emotions: [{ emotion: "joy", weight: 1 }] };
const emptyCheckIn: CheckIn = { intensity: 2, emotions: ["melancholy", "loneliness"], tension: 3, satisfaction: 1, wouldRelive: 2 };
const f1 = fuse(textJoy, emptyCheckIn, demoPhysio("calm"));
console.log("\n== Слияние: текст радостный, опрос «пусто», пульс спокойный ==");
console.log({ contradiction: f1.contradiction.present, energy: +f1.energy.toFixed(2), agreement: f1.agreement, confidence: +f1.confidence.toFixed(2), emotions: f1.emotions });
console.log(f1.notes.join("\n"));
assert.equal(f1.contradiction.present, true);
assert.ok(f1.energy < textJoy.energy, "опрос и пульс должны снизить энергию");
assert.ok(f1.notes.some((n) => n.includes("не определяет эмоции")));

const f2 = fuse(textJoy, { intensity: 5, emotions: ["joy", "excitement"], tension: 2, satisfaction: 5, wouldRelive: 5 }, demoPhysio("active"));
console.log("\nСогласованный день: contradiction =", f2.contradiction.present, ", confidence =", f2.confidence.toFixed(2), ", peaks =", f2.physio?.peaks);
assert.equal(f2.contradiction.present, false);
assert.ok(f2.confidence > f1.confidence);

const f3 = fuse(textJoy);
assert.deepEqual(f3.notes, []);
console.log("\nOK: все проверки подбора музыки и слияния пройдены");
