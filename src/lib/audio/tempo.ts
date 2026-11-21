// Определение темпа (BPM) без сторонних библиотек.
// Идея: 1) считаем, где громкость резко растёт (удары, начала нот);
// 2) ищем период, с которым эти всплески повторяются (автокорреляция);
// 3) среди «кратных» кандидатов (60 / 120 / 240) предпочитаем типичный для песен темп ≈ 110 BPM.

const HOP = 512; // шаг кадра в отсчётах

// Кривая «всплесков» громкости: насколько энергия кадра больше предыдущего
function onsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
): { env: Float32Array; fps: number } {
  const frames = Math.floor(samples.length / HOP);
  const env = new Float32Array(frames);
  // Низкие частоты (бочка, бас) и вся полоса — смешиваем, чтобы ловить и удары, и аккорды
  let low = 0;
  const k = Math.exp((-2 * Math.PI * 200) / sampleRate); // фильтр ~200 Гц
  let prevLow = 0,
    prevAll = 0;
  for (let f = 0; f < frames; f++) {
    let eLow = 0,
      eAll = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i++) {
      const s = samples[i];
      low = low * k + s * (1 - k);
      eLow += low * low;
      eAll += s * s;
    }
    eLow = Math.log1p(eLow * 100);
    eAll = Math.log1p(eAll * 100);
    env[f] = Math.max(0, eLow - prevLow) * 1.5 + Math.max(0, eAll - prevAll);
    prevLow = eLow;
    prevAll = eAll;
  }
  // Убираем медленный «фон», оставляя только всплески
  const out = new Float32Array(frames);
  const win = 16;
  for (let f = 0; f < frames; f++) {
    let m = 0,
      n = 0;
    for (let j = Math.max(0, f - win); j < Math.min(frames, f + win); j++) {
      m += env[j];
      n++;
    }
    out[f] = Math.max(0, env[f] - m / n);
  }
  return { env: out, fps: sampleRate / HOP };
}

export interface TempoResult {
  bpm: number;
  confidence: number; // 0..1
}

export function detectTempo(
  samples: Float32Array,
  sampleRate: number,
  minBpm = 60,
  maxBpm = 180,
): TempoResult {
  const { env, fps } = onsetEnvelope(samples, sampleRate);
  const n = env.length;
  const minLag = Math.floor((60 * fps) / maxBpm);
  const maxLag = Math.ceil((60 * fps) / minBpm);
  if (n < maxLag * 4) return { bpm: 100, confidence: 0 };

  // Автокорреляция для каждого возможного периода
  const ac = new Float32Array(maxLag * 2 + 2);
  for (let lag = 1; lag < ac.length && lag < n; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (n - lag);
  }

  // Оценка кандидата: своя корреляция + немного корреляции на половинном периоде,
  // умноженные на «привычность» темпа (лог-нормальное окно вокруг 110 BPM)
  let best = 0,
    bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.6) ** 2);
    // Половинный период тоже поддерживает кандидата: если удары идут и «между», темп скорее выше
    const half = ac[Math.round(lag / 2)] ?? 0;
    const score = (ac[lag] + 0.25 * half) * prior;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  // Проверка «октавы»: если на половинном периоде повторы сильнее, настоящий темп вдвое выше
  const halfLag = Math.round(best / 2);
  if (halfLag >= Math.floor((60 * fps) / 190) && ac[halfLag] > ac[best]) best = halfLag;
  // Уточняем положение пика (параболическая интерполяция)
  const y0 = ac[best - 1] ?? ac[best],
    y1 = ac[best],
    y2 = ac[best + 1] ?? ac[best];
  const denom = y0 - 2 * y1 + y2;
  const shift =
    denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  const bpm = (60 * fps) / (best + shift);
  // Уверенность: насколько пик выше среднего уровня корреляции (0 — шум, 1 — чёткий ритм)
  let mean = 0;
  for (let lag = minLag; lag <= maxLag; lag++) mean += ac[lag];
  mean /= maxLag - minLag + 1;
  const confidence = ac[best] > 0 ? Math.max(0, Math.min(1, (ac[best] - mean) / ac[best])) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence: +confidence.toFixed(2) };
}
