// src/lib/music/genScore.ts
// Генеративный саундтрек: система «сочиняет» музыку в браузере по параметрам выбранного пресета
// (темп, лад, энергия, яркость, инструменты). Без файлов и без авторских прав.
// ВАЖНО: звук стартует только после клика пользователя (правило браузеров): вызывать start() из обработчика клика.
// Не проверено на слух: после вставки в проект послушать все 12 пресетов и подкрутить громкости.

export interface ScoreParams {
  bpm: number;
  mode: "major" | "minor" | "mixed" | "unknown";
  energy: number; // 0..1
  brightness: number; // 0..1
  tags: string[]; // piano, pad, pluck, drums, electronic, vintage, crackle
  seed?: number;
}

type Quality = "maj" | "min";
const PROGRESSIONS: Record<string, { roots: number[]; q: Quality[] }> = {
  major: { roots: [0, 9, 5, 7], q: ["maj", "min", "maj", "maj"] }, // I–vi–IV–V
  minor: { roots: [0, 8, 3, 10], q: ["min", "maj", "maj", "maj"] }, // i–VI–III–VII
  mixed: { roots: [0, 5, 9, 7], q: ["maj", "min", "min", "maj"] }, // I–iv–vi–V: горько-сладкая смена лада
};
const TRIAD: Record<Quality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7] };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GenerativeScore {
  private ctx: AudioContext;
  private p: ScoreParams;
  private master: GainNode;
  private analyser: AnalyserNode;
  private rev: ConvolverNode;
  private wet: GainNode;
  private noise: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private rnd: () => number;
  private root: number;
  private prog: { roots: number[]; q: Quality[] };
  private stepDur: number;

  constructor(ctx: AudioContext, p: ScoreParams, destination?: AudioNode) {
    this.ctx = ctx;
    this.p = p;
    this.rnd = mulberry32(p.seed ?? 7);
    this.root = [0, 2, 3, 5, 7, 9][Math.floor(this.rnd() * 6)];
    this.prog = PROGRESSIONS[p.mode === "unknown" ? "major" : p.mode];
    this.stepDur = 60 / p.bpm / 4; // шестнадцатая

    const comp = ctx.createDynamicsCompressor();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(destination ?? ctx.destination);

    // реверберация из затухающего шума
    this.rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (this.rnd() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    this.rev.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.rev.connect(this.wet);
    this.wet.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rnd() * 2 - 1;
  }

  /** Для визуальной реакции рендерера на громкость. */
  getAnalyser() { return this.analyser; }

  start() {
    void this.ctx.resume();
    this.nextTime = this.ctx.currentTime + 0.08;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 1.2);
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.5);
  }

  /** Приглушить музыку под озвучку. */
  duck(on: boolean) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? 0.22 : 0.8, t + 0.4);
  }

  private tick() {
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(this.nextTime, this.step);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  private out(node: AudioNode, sendRev = 0.3) {
    node.connect(this.master);
    if (sendRev > 0) {
      const g = this.ctx.createGain();
      g.gain.value = sendRev;
      node.connect(g);
      g.connect(this.rev);
    }
  }

  private scheduleStep(t: number, step: number) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const { energy, brightness, tags } = this.p;
    const rootMidi = 57 + this.root + this.prog.roots[bar];
    const tones = TRIAD[this.prog.q[bar]].map((x) => rootMidi + x);
    const barDur = this.stepDur * 16;

    if (s === 0) this.pad(t, tones, barDur, brightness);
    if (s === 0 || (energy > 0.35 && s === 8)) this.bass(t, rootMidi - 24, this.stepDur * 7);

    // арпеджио: редкое для спокойных дней, частое для энергичных
    const every = energy < 0.3 ? 4 : 2;
    if (s % every === 0) {
      const arp = [...tones, tones[0] + 12, tones[1] + 12, tones[2] + 12];
      const pattern = [0, 1, 2, 3, 4, 3, 2, 1];
      const note = arp[pattern[Math.floor(s / every) % pattern.length]];
      if (this.rnd() < 0.9) this.pluck(t, note + (tags.includes("piano") ? 12 : 0), tags.includes("piano"));
    }

    const drums = tags.includes("drums") || tags.includes("electronic") || energy > 0.6;
    if (drums) {
      if (s === 0 || s === 8 || (energy > 0.8 && (s === 4 || s === 12))) this.kick(t);
      if (s % 4 === 2) this.hat(t, 0.05);
      if (energy > 0.8 && s % 2 === 1) this.hat(t, 0.025);
    }
    if ((tags.includes("vintage") || tags.includes("crackle")) && this.rnd() < 0.18) this.crackle(t);
  }

  private pad(t: number, tones: number[], dur: number, brightness: number) {
    for (const m of tones) for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = mtof(m + 12);
      o.detune.value = det;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 400 + 3200 * brightness;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.9);
      g.gain.setValueAtTime(0.018, t + dur - 0.2);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.9);
      o.connect(f); f.connect(g);
      this.out(g, 0.5);
      o.start(t); o.stop(t + dur + 1);
    }
  }

  private pluck(t: number, midi: number, piano: boolean) {
    const o = this.ctx.createOscillator();
    o.type = piano ? "sine" : "triangle";
    o.frequency.value = mtof(midi);
    const dec = 0.35 + (1 - this.p.energy) * 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(piano ? 0.09 : 0.07, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g);
    if (piano) { // второй обертон: добавляет «фортепианный» тембр
      const o2 = this.ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = mtof(midi) * 2;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.025, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dec * 0.6);
      o2.connect(g2); this.out(g2, 0.4);
      o2.start(t); o2.stop(t + dec);
    }
    this.out(g, 0.45);
    o.start(t); o.stop(t + dec + 0.05);
  }

  private bass(t: number, midi: number, dur: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = mtof(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, 0);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); this.out(g, 0);
    o.start(t); o.stop(t + 0.3);
  }

  private noiseBurst(t: number, dur: number, gain: number, hp: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); this.out(g, 0.1);
    src.start(t, this.rnd() * 0.5); src.stop(t + dur + 0.02);
  }

  private hat(t: number, gain: number) { this.noiseBurst(t, 0.04, gain, 7000); }
  private crackle(t: number) { this.noiseBurst(t, 0.006, 0.03, 2500); }
}
