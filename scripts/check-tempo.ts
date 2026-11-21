// Проверка определения темпа на синтезированных треках (настоящие песни проверяются вручную).
// Запуск (PowerShell): npm run check:tempo
import { detectTempo } from "../src/lib/audio/tempo";

const SR = 22050;

type Style = "kick" | "full" | "hats" | "nokick" | "offbeat";

// Синтетический трек: аккорды, бочка, арпеджио, хай-хэт — в разных сочетаниях
function track(
  bpm: number,
  style: Style,
  seconds = 30,
  seed = 1,
): Float32Array {
  const n = SR * seconds;
  const out = new Float32Array(n);
  const beat = 60 / bpm;
  const f = (s: number) => 220 * 2 ** (s / 12);
  let rnd = seed;
  const noise = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ph = t % beat;
    const root = [0, 5, 7, 3][Math.floor(t / (beat * 4)) % 4];
    const pad =
      [0, 4, 7].reduce(
        (s, iv) => s + Math.sin(2 * Math.PI * f(root + iv) * t),
        0,
      ) / 3;
    const kick =
      Math.exp(-ph * 28) *
      Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-ph * 40)) * ph);
    const e8 = t % (beat / 2);
    const arp =
      Math.sin(
        2 *
          Math.PI *
          f(root + [0, 4, 7][Math.floor(t / (beat / 2)) % 3] + 12) *
          t,
      ) * Math.exp(-e8 * 6);
    const hat = noise() * Math.exp(-e8 * 120);
    // Акцент на 2 и 4 долю (как малый барабан)
    const beatIdx = Math.floor(t / beat) % 2;
    const snare = beatIdx === 1 ? noise() * Math.exp(-ph * 25) : 0;
    let s = 0;
    if (style === "kick") s = 0.2 * pad + 0.7 * kick;
    if (style === "full") s = 0.2 * pad + 0.6 * kick + 0.18 * arp;
    if (style === "hats") s = 0.2 * pad + 0.5 * kick + 0.25 * hat + 0.3 * snare;
    if (style === "nokick")
      s = 0.25 * pad + 0.4 * arp * (1 + 0.6 * Math.exp(-ph * 6));
    if (style === "offbeat")
      s =
        0.2 * pad +
        0.5 * kick +
        0.4 * hat * (Math.floor(t / (beat / 2)) % 2) +
        0.3 * snare;
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

const cases: [number, Style][] = [
  [68, "full"],
  [76, "nokick"],
  [84, "hats"],
  [92, "full"],
  [100, "kick"],
  [104, "full"],
  [112, "hats"],
  [120, "kick"],
  [128, "offbeat"],
  [132, "full"],
  [140, "hats"],
  [160, "kick"],
];

let ok = 0;
for (const [bpm, style] of cases) {
  const r = detectTempo(track(bpm, style), SR);
  const err = Math.abs(r.bpm - bpm) / bpm;
  const pass = err <= 0.08;
  if (pass) ok++;
  console.log(
    `${pass ? "OK  " : "FAIL"} ${String(bpm).padStart(3)} BPM (${style.padEnd(7)}) → ${r.bpm} (уверенность ${r.confidence})`,
  );
}
console.log(`\nВ пределах ±8%: ${ok}/${cases.length}`);
process.exit(ok >= cases.length * 0.8 ? 0 : 1);
