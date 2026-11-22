// src/lib/fusion/fusionV2.ts
// Слияние трёх каналов: текст (LLM), опрос (чек-ин), физиологический контекст (пульс).
// Опрос влияет на эмоции с весом; пульс влияет ТОЛЬКО на оценку активности (энергии)
// и на моменты «пиков» в анимации. Пульс НЕ подтверждает и НЕ определяет эмоции —
// так требует бриф хакатона (запрет выдавать догадки за диагностику).

export interface Emo {
  emotion: string;
  weight: number;
}

export interface TextEstimate {
  valence: number; // -1..1
  energy: number;
  tension: number;
  warmth: number;
  nostalgia: number; // 0..1
  confidence: number; // 0..1
  emotions: Emo[];
}

export interface CheckIn {
  intensity: number; // 1..5
  emotions: string[]; // до 3
  tension: number; // 1..5
  satisfaction: number; // 1..5
  wouldRelive: number; // 1..5
}

export interface Physio {
  kind: "demo" | "import";
  restHr: number;
  avgHr: number;
  maxHr: number;
  series: { t: number; hr: number }[];
}

export interface Fused {
  valence: number;
  energy: number;
  tension: number;
  warmth: number;
  nostalgia: number;
  confidence: number;
  emotions: Emo[];
  contradiction: { present: boolean; note: string };
  agreement: { energy: number; valence: number | null }; // 0..1
  physio?: { arousal: number; peaks: number[]; label: string };
  notes: string[]; // для панели «Почему»
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const pct = (x: number) => Math.round(x * 100);

const POLARITY: Record<string, number> = { joy: 0.8, nostalgia: 0.2, calm: 0.4, tenderness: 0.6, excitement: 0.7, pride: 0.6, gratitude: 0.7, wonder: 0.6, melancholy: -0.5, loneliness: -0.6, tension: -0.4, fatigue: -0.3 };
const WARMTH: Record<string, number> = { joy: 0.6, tenderness: 0.8, gratitude: 0.6, nostalgia: 0.5, calm: 0.3, excitement: 0.3, pride: 0.3, wonder: 0.2, melancholy: -0.2, loneliness: -0.5, tension: -0.4, fatigue: -0.2 };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function checkInEstimate(c: CheckIn) {
  const pol = avg(c.emotions.map((e) => POLARITY[e] ?? 0));
  const warm = avg(c.emotions.map((e) => WARMTH[e] ?? 0));
  return {
    valence: clamp(((c.satisfaction - 3) / 2) * 0.7 + pol * 0.3, -1, 1),
    energy: (c.intensity - 1) / 4,
    tension: (c.tension - 1) / 4,
    warmth: clamp(0.5 + 0.5 * warm),
    nostalgia: clamp(0.25 + (c.emotions.includes("nostalgia") ? 0.45 : 0) + 0.05 * (c.wouldRelive - 3)),
  };
}

function std(xs: number[]) {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
}

/** Активность дня по пульсу (0..1) и моменты пиков (0..1 по длине дня). */
export function physioEstimate(ph: Physio) {
  const arousal = clamp(((ph.avgHr - ph.restHr) / 45) * 0.6 + (std(ph.series.map((s) => s.hr)) / 18) * 0.4);
  const t0 = ph.series[0]?.t ?? 0;
  const t1 = ph.series[ph.series.length - 1]?.t ?? 1;
  const thr = ph.avgHr + 0.6 * (ph.maxHr - ph.avgHr);
  const peaks: number[] = [];
  for (let i = 1; i < ph.series.length - 1; i++) {
    const s = ph.series[i];
    if (s.hr >= thr && s.hr >= ph.series[i - 1].hr && s.hr >= ph.series[i + 1].hr) peaks.push(clamp((s.t - t0) / (t1 - t0 || 1)));
  }
  return { arousal, peaks: peaks.slice(0, 4) };
}

export function fuse(text: TextEstimate, checkIn?: CheckIn, physio?: Physio): Fused {
  const notes: string[] = [];
  const wT = 1;
  const wC = checkIn ? 0.7 : 0;
  const c = checkIn ? checkInEstimate(checkIn) : undefined;
  const mix = (t: number, cv?: number) => (cv === undefined ? t : (t * wT + cv * wC) / (wT + wC));

  const valence = mix(text.valence, c?.valence);
  const tension = mix(text.tension, c?.tension);
  const warmth = mix(text.warmth, c?.warmth);
  const nostalgia = mix(text.nostalgia, c?.nostalgia);

  const p = physio ? physioEstimate(physio) : undefined;
  const energyEstimates = [text.energy, ...(c ? [c.energy] : []), ...(p ? [p.arousal] : [])];
  const energy = clamp((text.energy * wT + (c ? c.energy * wC : 0) + (p ? p.arousal * 0.35 : 0)) / (wT + wC + (p ? 0.35 : 0)));
  const energySpread = Math.max(...energyEstimates) - Math.min(...energyEstimates);
  const agreementEnergy = clamp(1 - energySpread);
  const agreementValence = c ? clamp(1 - Math.abs(text.valence - c.valence) / 2) : null;

  const dv = c ? text.valence - c.valence : 0;
  const contradictionPresent = !!c && Math.abs(dv) > 0.5;
  let contradictionNote = "";
  if (contradictionPresent) {
    contradictionNote = dv > 0 ? "Текст звучит радостнее, чем ваша самооценка дня" : "Текст звучит мрачнее, чем ваша самооценка дня";
    notes.push(`${contradictionNote}: это сохранено как контраст (двойная экспозиция), а не как ошибка анализа.`);
  }
  if (checkIn) {
    notes.push(`Опрос учтён с весом ${pct(wC / (wT + wC))}%: насыщенность ${checkIn.intensity}/5, напряжение ${checkIn.tension}/5, удовлетворённость ${checkIn.satisfaction}/5${checkIn.emotions.length ? `, эмоции: ${checkIn.emotions.join(", ")}` : ""}.`);
  }
  let physioOut: Fused["physio"];
  if (physio && p) {
    const agree = Math.abs(p.arousal - text.energy) < 0.3;
    const label = physio.kind === "demo" ? "демо-данные" : "импорт с устройства";
    notes.push(
      `Пульс (${label}): средний ${physio.avgHr}, пик ${physio.maxHr} → физиологическая активность ≈${pct(p.arousal)}%, ${agree ? "согласуется" : "расходится"} с активностью, описанной в тексте (≈${pct(text.energy)}%). Пульс используется только как контекст: он двигает ритм анимации и отмечает пики дня, но не определяет эмоции.`,
    );
    physioOut = { arousal: p.arousal, peaks: p.peaks, label };
  }

  let confidence = text.confidence;
  if (agreementValence !== null) confidence += (agreementValence - 0.6) * 0.2;
  if (physio) confidence += (agreementEnergy - 0.6) * 0.1;
  if (contradictionPresent) confidence -= 0.1;
  confidence = clamp(confidence, 0.2, 0.95);

  // Смешанные эмоции: объединяем эмоции текста и выбранные в опросе
  const merged = new Map<string, number>();
  for (const e of text.emotions) merged.set(e.emotion, (merged.get(e.emotion) ?? 0) + e.weight * wT);
  if (checkIn) for (const e of checkIn.emotions) merged.set(e, (merged.get(e) ?? 0) + 0.8 * wC);
  const emotions = [...merged.entries()]
    .map(([emotion, weight]) => ({ emotion, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const top = emotions[0]?.weight || 1;
  emotions.forEach((e) => (e.weight = clamp(e.weight / top)));

  return {
    valence, energy, tension, warmth, nostalgia, confidence, emotions,
    contradiction: { present: contradictionPresent, note: contradictionNote },
    agreement: { energy: agreementEnergy, valence: agreementValence },
    physio: physioOut,
    notes,
  };
}

/** Демо-пульс для демонстрации (честно помечается как «демо-данные»). */
export function demoPhysio(kind: "calm" | "active" | "tense"): Physio {
  const cfg = { calm: { rest: 62, base: 68, amp: 6, spike: 14 }, active: { rest: 64, base: 98, amp: 22, spike: 40 }, tense: { rest: 66, base: 88, amp: 14, spike: 34 } }[kind];
  const series: { t: number; hr: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const wave = Math.sin(i / 3.2) * cfg.amp * 0.5;
    const spike = i === 15 || i === 16 ? cfg.spike * (i === 15 ? 1 : 0.6) : 0;
    series.push({ t: i, hr: Math.round(cfg.base + wave + spike + ((i * 7) % 5) - 2) });
  }
  const hrs = series.map((s) => s.hr);
  return { kind: "demo", restHr: cfg.rest, avgHr: Math.round(avg(hrs)), maxHr: Math.max(...hrs), series };
}
