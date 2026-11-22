// Адаптер между данными дня (MoodSpec, AudioSpec) и модулем подбора музыки musicMatch.ts.
// Система подбирает саундтрек по профилю дня и сравнивает с ним песню пользователя.
import type { AudioSpec, MoodSpec } from "../schema";
import {
  pickMusic,
  PRESETS,
  type Candidate,
  type MusicPick,
  type Profile,
} from "./musicMatch";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Профиль дня для подбора музыки
export function toProfile(mood: MoodSpec): Profile {
  const top = Math.max(...mood.emotions.map((e) => e.weight));
  const nost =
    mood.emotions.find((e) => e.emotion === "nostalgia")?.weight ?? 0;
  return {
    valence: mood.valence,
    energy: mood.energy,
    tension: mood.tension,
    warmth: mood.warmth,
    nostalgia: clamp((nost / top) * 0.85),
    contradiction: mood.contradiction.present,
  };
}

// Характер звучания песни пользователя — по жанру (оценочно)
function tagsFromGenre(audio: AudioSpec): string[] {
  const g = `${audio.genre ?? ""} ${audio.title ?? ""}`.toLowerCase();
  const tags: string[] = [];
  if (/фортеп|piano|пиано|класс|classic/.test(g)) tags.push("piano");
  if (/электр|electro|techno|house|edm|синт/.test(g))
    tags.push("electronic", "drums");
  if (/рок|rock|поп|pop|хип|hip|рэп|rap|dance|инди|indie/.test(g))
    tags.push("drums");
  if (/акуст|acoustic|фолк|folk|гитар/.test(g)) tags.push("pluck");
  if (
    /ретро|retro|джаз|jazz|соул|soul|шансон|oldies/.test(g) ||
    (audio.year && audio.year < 1990)
  )
    tags.push("vintage");
  if (!tags.length)
    tags.push(
      audio.energy > 0.6 ? "drums" : audio.energy < 0.35 ? "pad" : "pluck",
    );
  return tags;
}

export function userCandidate(audio: AudioSpec): Candidate {
  return {
    id: "user-song",
    kind: "user-song",
    title:
      [audio.artist, audio.title].filter(Boolean).join(" — ") || "Ваша песня",
    bpm: audio.bpm,
    mode: audio.mode,
    energy: audio.energy,
    brightness: audio.brightness,
    // Окрас песни без ИИ надёжно не измерить: грубо по ладу и энергии
    valence:
      audio.mode === "major"
        ? 0.4
        : audio.mode === "minor"
          ? -0.3
          : clamp(audio.energy - 0.4, -0.3, 0.4),
    tags: tagsFromGenre(audio),
    year: audio.year,
    estimated: audio.estimated || audio.mode === "unknown",
  };
}

export function pickForDay(mood: MoodSpec, audio: AudioSpec): MusicPick {
  return pickMusic(toProfile(mood), { userSong: userCandidate(audio) });
}

export function presetById(id: string): Candidate | undefined {
  return PRESETS.find((p) => p.id === id);
}

// Параметры звучащей музыки в формате AudioSpec — чтобы mapToStyle брал темп того, что реально играет
export function presetAudioSpec(c: Candidate): AudioSpec {
  return {
    title: c.title,
    artist: "сгенерировано в браузере",
    bpm: c.bpm,
    bpmConfidence: 1,
    energy: c.energy,
    brightness: c.brightness,
    mode: c.mode === "mixed" ? "unknown" : c.mode,
    source: "generated",
    estimated: false,
  };
}
