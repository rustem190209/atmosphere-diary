// Параметры «виртуального оператора» из данных дня — общие для рендерера и панели «Почему».
import type { DayRecord } from "../schema";
import { planShots, type ShotPlan } from "./virtualCamera";
import { physioPeaks } from "../physio";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Число-«зерно» из id дня: один и тот же день всегда снимается одинаково
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Динамика движения E_m восстанавливается из приближения камеры (mapToStyle: zoom = 1 + lerp(0.03, 0.12, E_m))
export function motionEnergy(day: Pick<DayRecord, "style">): number {
  return clamp((day.style.camera.zoomTo - 1 - 0.03) / 0.09);
}

export function cameraPlan(
  day: DayRecord,
  photos: { w: number; h: number; focus: { x: number; y: number } }[],
): ShotPlan[] {
  return planShots({
    photos,
    duration: Math.max(4, day.style.timeline.duration - 2), // последние 2 с — финальный кадр с названием
    cutInterval: day.style.timeline.cutInterval,
    bpm: day.audio.bpm,
    energy: motionEnergy(day),
    tension: day.mood.tension,
    peaks: day.input.physio ? physioPeaks(day.input.physio) : [],
    seed: seedOf(day.id),
  });
}

// Короткая сводка для панели «Почему»
export function cameraSummary(day: DayRecord) {
  const n = Math.max(1, day.input.photos.length);
  const shots = cameraPlan(
    day,
    Array.from({ length: n }, () => ({
      w: 1200,
      h: 1500,
      focus: { x: 0.5, y: 0.5 },
    })),
  );
  const beat = 60 / day.audio.bpm;
  const avgLen =
    shots.reduce((s, x) => s + (x.end - x.start), 0) / shots.length;
  return {
    shots: shots.length,
    photos: n,
    every: avgLen,
    beats: Math.max(1, Math.round(avgLen / beat)),
    punches: shots.reduce((s, x) => s + x.punches.length, 0),
    kinds: new Set(shots.map((s) => s.kind)).size,
  };
}
