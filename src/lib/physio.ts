// Физиологический контекст (пульс): демо-данные, импорт JSON, активность и пики.
// Пульс — это контекст, а не подтверждение эмоций: он влияет только на оценку активности
// и на «удары камеры» в моменты пиков.
import type { PhysioContext } from "./schema";
import { demoPhysio, physioEstimate, type Physio } from "./fusion/fusionV2";

const toV2 = (p: PhysioContext): Physio => ({
  kind: p.kind,
  restHr: p.restHr ?? Math.max(50, Math.round(p.avgHr - 12)),
  avgHr: p.avgHr,
  maxHr: p.maxHr,
  series: p.series,
});

export function physioPeaks(p: PhysioContext): number[] {
  return physioEstimate(toV2(p)).peaks;
}

export function physioArousal(p: PhysioContext): number {
  return physioEstimate(toV2(p)).arousal;
}

export type DemoPulse = "calm" | "active" | "tense";
export const DEMO_PULSE_LABELS: Record<DemoPulse, string> = {
  calm: "спокойный",
  active: "активный",
  tense: "напряжённый",
};

export function demoPulse(kind: DemoPulse): PhysioContext {
  const d = demoPhysio(kind);
  return {
    kind: "demo",
    restHr: d.restHr,
    avgHr: d.avgHr,
    maxHr: d.maxHr,
    series: d.series,
  };
}

// Импорт JSON вида {restHr?, avgHr?, maxHr?, series:[{t,hr}]}; недостающее считаем сами
export function parsePulseJson(text: string): PhysioContext {
  const raw = JSON.parse(text) as {
    restHr?: number;
    avgHr?: number;
    maxHr?: number;
    series?: { t: number; hr: number }[];
  };
  const series = (raw.series ?? [])
    .filter(
      (s) =>
        Number.isFinite(s?.t) &&
        Number.isFinite(s?.hr) &&
        s.hr > 25 &&
        s.hr < 230,
    )
    .map((s) => ({ t: s.t, hr: Math.round(s.hr) }));
  if (series.length < 4)
    throw new Error("В файле должно быть хотя бы 4 точки series: [{t, hr}]");
  // Не больше 48 точек: прореживаем равномерно
  const step = Math.ceil(series.length / 48);
  const thin = series.filter((_, i) => i % step === 0).slice(0, 48);
  const hrs = thin.map((s) => s.hr);
  return {
    kind: "import",
    restHr: raw.restHr,
    avgHr: raw.avgHr ?? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
    maxHr: raw.maxHr ?? Math.max(...hrs),
    series: thin,
  };
}

export const pulseLabel = (p: PhysioContext) =>
  p.kind === "demo" ? "демо-данные" : "импорт с устройства";
