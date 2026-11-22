import assert from "node:assert/strict";
import { planShots, findFocus, beatTimes } from "../src/lib/render/virtualCamera.ts";

// 1) findFocus находит яркий объект справа вверху
const W = 96, H = 96, data = new Uint8ClampedArray(W * H * 4).fill(40);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = Math.hypot(x - 0.7 * W, y - 0.3 * H);
  if (d < 12) { const i = (y * W + x) * 4; data[i] = 250; data[i + 1] = 180; data[i + 2] = 60; data[i + 3] = 255; }
  else data[(y * W + x) * 4 + 3] = 255;
}
const f = findFocus({ data, width: W, height: H });
console.log("focus:", f);
assert.ok(Math.abs(f.x - 0.7) < 0.15 && Math.abs(f.y - 0.3) < 0.15);

// 2) одно фото → несколько разных планов
const one = [{ w: 1200, h: 1600, focus: f }];
const calm = planShots({ photos: one, duration: 24, cutInterval: 5.5, bpm: 70, energy: 0.25, tension: 0.2, seed: 1 });
const hot = planShots({ photos: one, duration: 24, cutInterval: 2, bpm: 128, energy: 0.9, tension: 0.8, peaks: [0.65], seed: 1 });
console.log("calm:", calm.length, "планов", calm.map((s) => s.kind).join(","), "| hot:", hot.length, "планов", hot.map((s) => s.kind).join(","));
assert.ok(calm.length >= 3 && hot.length > calm.length);
assert.ok(new Set(calm.map((s) => s.kind)).size >= 3, "из одного фото должны получаться разные планы");
for (const plan of [calm, hot]) {
  assert.equal(plan[0].start, 0);
  assert.ok(Math.abs(plan[plan.length - 1].end - 24) < 1e-6);
  for (let i = 1; i < plan.length; i++) assert.equal(plan[i].start, plan[i - 1].end);
}
assert.ok(hot.some((s) => s.punches.length > 0), "у динамичного дня есть удары камеры");
assert.equal(calm.every((s) => s.punches.length === 0), true);
assert.ok(hot[0].shake > calm[0].shake);
// 3) смены кадров на долях такта
const beat = 60 / 128;
for (const s of hot.slice(0, -1)) assert.ok(Math.abs((s.end - s.start) / beat - Math.round((s.end - s.start) / beat)) < 1e-6);
assert.equal(beatTimes(120, 4).length, 8);
console.log("OK: камера — планы, ритм, удары и фокус проверены");
