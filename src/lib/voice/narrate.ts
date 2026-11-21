// Озвучка текста дня (раздел 8.13 ТЗ) встроенным синтезатором речи браузера.
// Голос выбирается правилом по narrationTone, а не случайно. Только синтезированные голоса.
import type { MoodSpec } from "../schema";

type Tone = MoodSpec["narrationTone"];

// Профили голоса: скорость, высота, громкость
export const VOICE_PROFILES: Record<
  Tone,
  { rate: number; pitch: number; volume: number; label: string }
> = {
  "calm-warm": {
    rate: 0.9,
    pitch: 0.95,
    volume: 1,
    label: "спокойный и тёплый",
  },
  "bright-fast": {
    rate: 1.15,
    pitch: 1.12,
    volume: 1,
    label: "живой и быстрый",
  },
  "cool-precise": {
    rate: 1.02,
    pitch: 0.82,
    volume: 1,
    label: "ровный и собранный",
  },
  "soft-quiet": {
    rate: 0.8,
    pitch: 0.9,
    volume: 0.75,
    label: "тихий и мягкий",
  },
};

export function canNarrate(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Русский голос, если он есть в системе (голоса подгружаются асинхронно)
function pickVoice(): Promise<SpeechSynthesisVoice | undefined> {
  return new Promise((resolve) => {
    const find = () =>
      speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith("ru"));
    const now = find();
    if (now || speechSynthesis.getVoices().length) return resolve(now);
    const timer = setTimeout(() => resolve(find()), 1500);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timer);
        resolve(find());
      },
      { once: true },
    );
  });
}

export async function narrate(
  text: string,
  tone: Tone,
  hooks: { onStart?: () => void; onEnd?: () => void } = {},
) {
  if (!canNarrate()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const p = VOICE_PROFILES[tone];
  u.lang = "ru-RU";
  u.rate = p.rate;
  u.pitch = p.pitch;
  u.volume = p.volume;
  const voice = await pickVoice();
  if (voice) u.voice = voice;
  u.onstart = () => hooks.onStart?.();
  u.onend = () => hooks.onEnd?.();
  u.onerror = () => hooks.onEnd?.();
  speechSynthesis.speak(u);
}

export function stopNarration() {
  if (canNarrate()) speechSynthesis.cancel();
}
