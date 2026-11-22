"use client";
// Экран «Создать воспоминание»: дневник, фото, музыка, чувства (+ уточнения и пульс), затем экран анализа.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMOTION_LABELS,
  type CheckIn,
  type Emotion,
  type PhysioContext,
} from "@/lib/schema";
import type { SongMood } from "@/lib/audio/analyze";
import { buildDay, type DayInput, type Step } from "@/lib/pipeline";
import {
  DEMO_PULSE_LABELS,
  demoPulse,
  parsePulseJson,
  pulseLabel,
  type DemoPulse,
} from "@/lib/physio";
import AnalysisOverlay from "@/components/AnalysisOverlay";

const MAX_PHOTOS = 6;
const MAX_PHOTO_MB = 10;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_EMOTIONS = 3;
// Порядок чувств: сначала самые частые
const EMOTION_ORDER: Emotion[] = [
  "nostalgia",
  "melancholy",
  "joy",
  "calm",
  "excitement",
  "gratitude",
  "loneliness",
  "hope",
  "tenderness",
  "wonder",
  "pride",
  "tension",
  "fatigue",
];

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="scale">
      <span>{label}</span>
      <div className="scale-dots" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={value === n}
            className={value === n ? "on" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_SCALES = {
  intensity: 3,
  tension: 3,
  satisfaction: 3,
  wouldRelive: 3,
} as const;

export default function DayForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [drag, setDrag] = useState(false);
  const [songTab, setSongTab] = useState<"link" | "file">("link");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songYear, setSongYear] = useState("");
  const [songGenre, setSongGenre] = useState("");
  const [songMood, setSongMood] = useState<SongMood>("");
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [scales, setScales] = useState<{
    intensity: number;
    tension: number;
    satisfaction: number;
    wouldRelive: number;
  }>({ ...DEFAULT_SCALES });
  const [scalesTouched, setScalesTouched] = useState(false);
  const [physio, setPhysio] = useState<PhysioContext | undefined>();
  const [pulseError, setPulseError] = useState("");
  const [consent, setConsent] = useState(true);
  const [step, setStep] = useState<Step | null>(null);
  const [running, setRunning] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);

  // Превью фото: временные ссылки на файлы, удаляем при смене списка
  const previews = useMemo(
    () => photos.map((f) => URL.createObjectURL(f)),
    [photos],
  );
  useEffect(
    () => () => previews.forEach((u) => URL.revokeObjectURL(u)),
    [previews],
  );

  function addPhotos(list: FileList | File[] | null) {
    if (!list) return;
    setPhotoError("");
    const next = [...photos];
    for (const f of Array.from(list)) {
      if (!PHOTO_TYPES.includes(f.type)) {
        setPhotoError(`«${f.name}»: нужен JPG, PNG или WebP`);
        continue;
      }
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        setPhotoError(`«${f.name}» больше ${MAX_PHOTO_MB} МБ`);
        continue;
      }
      if (next.length >= MAX_PHOTOS) {
        setPhotoError(`Не больше ${MAX_PHOTOS} фото`);
        break;
      }
      next.push(f);
    }
    setPhotos(next);
  }

  function toggleEmotion(e: Emotion) {
    setEmotions((list) =>
      list.includes(e)
        ? list.filter((x) => x !== e)
        : list.length >= MAX_EMOTIONS
          ? list
          : [...list, e],
    );
  }

  const setScale = (k: keyof typeof scales) => (v: number) => {
    setScales((s) => ({ ...s, [k]: v }));
    setScalesTouched(true);
  };

  const linkOk = /^https?:\/\/\S+$/.test(songUrl.trim());
  const hasSong =
    songTab === "file"
      ? !!songFile
      : linkOk || !!(songTitle.trim() || artist.trim());
  const problems = [
    text.trim().length < 20 && "расскажите о дне хотя бы в паре предложений",
    photos.length === 0 && "добавьте хотя бы одну фотографию",
    !hasSong &&
      (songTab === "file"
        ? "выберите аудиофайл"
        : "укажите песню: название и исполнителя или ссылку"),
    songTab === "link" &&
      songUrl.trim() &&
      !linkOk &&
      "ссылка на песню должна начинаться с http",
  ].filter(Boolean) as string[];

  function resetForm() {
    setText("");
    setPhotos([]);
    setPhotoError("");
    setArtist("");
    setSongTitle("");
    setSongUrl("");
    setSongFile(null);
    setSongYear("");
    setSongGenre("");
    setSongMood("");
    setEmotions([]);
    setScales({ ...DEFAULT_SCALES });
    setScalesTouched(false);
    setPhysio(undefined);
    setPulseError("");
    setStep(null);
    setError("");
    setFormKey((k) => k + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length || running) return;
    setError("");
    setRunning(true);
    setDoneId(null);
    const meta = {
      title: songTitle.trim() || undefined,
      artist: artist.trim() || undefined,
      year: Number(songYear) > 1900 ? Number(songYear) : undefined,
      genre: songGenre.trim() || undefined,
      mood: songMood,
    };
    const song: DayInput["song"] =
      songTab === "file" && songFile
        ? { kind: "file", file: songFile, meta }
        : linkOk
          ? { kind: "link", url: songUrl.trim(), meta }
          : { kind: "meta", meta };
    // Чек-ин есть, если выбраны чувства или тронуты шкалы
    const checkIn: CheckIn | undefined =
      emotions.length || scalesTouched
        ? ({ ...scales, emotions } as CheckIn)
        : undefined;
    try {
      const day = await buildDay(
        { text: text.trim(), photos, song, checkIn, physio, consent },
        setStep,
      );
      setDoneId(day.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setRunning(false);
      setStep(null);
    }
  }

  // Экран анализа закончил показ этапов — открываем готовое воспоминание
  const finish = useCallback(() => {
    if (!doneId) return;
    const id = doneId;
    resetForm();
    setRunning(false);
    setDoneId(null);
    router.push(`/day/${id}`);
  }, [doneId, router]);

  return (
    <>
      {running && (
        <AnalysisOverlay
          step={step}
          done={!!doneId}
          photo={previews[0]}
          onFinished={finish}
        />
      )}
      <form key={formKey} className="day-form" onSubmit={submit}>
        <section className="form-step">
          <header>
            <span className="num">01</span>
            <h3>Дневник</h3>
            <p className="hint">
              Свободным текстом. Погода, свет, звуки, кто был рядом.
            </p>
          </header>
          <div className="body">
            <textarea
              className="journal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Сегодня мы гуляли по парку, всё было в жёлтых листьях…"
              aria-label="Запись о дне"
            />
            <span className="hint">
              {text.trim().length} символов
              {text.trim().length < 20 ? " · минимум 20" : ""}
            </span>
          </div>
        </section>

        <section className="form-step">
          <header>
            <span className="num">02</span>
            <h3>Фотографии</h3>
            <p className="hint">
              От 1 до 6 кадров. Палитра фильма берётся из них.
            </p>
          </header>
          <div className="body">
            <div className="photo-grid">
              {previews.map((src, k) => (
                <div className="photo-thumb" key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Фото ${k + 1}`} />
                  <button
                    type="button"
                    className="x"
                    aria-label={`Убрать фото ${k + 1}`}
                    onClick={() => setPhotos(photos.filter((_, j) => j !== k))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label
                  className={drag ? "photo-add drag" : "photo-add"}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    addPhotos(e.dataTransfer.files);
                  }}
                >
                  <input
                    type="file"
                    accept={PHOTO_TYPES.join(",")}
                    multiple
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <span className="plus">+</span>
                  <span>
                    Добавить фото
                    <br />
                    или перетащить сюда
                  </span>
                </label>
              )}
            </div>
            {photoError && <span className="error">{photoError}</span>}
          </div>
        </section>

        <section className="form-step">
          <header>
            <span className="num">03</span>
            <h3>Музыка</h3>
            <p className="hint">
              Песня, которая звучала в этот день. Ритм монтажа идёт от неё.
            </p>
          </header>
          <div className="body">
            <div className="row">
              <input
                className="field-input"
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                placeholder="Название песни"
                aria-label="Название песни"
              />
              <input
                className="field-input"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Исполнитель"
                aria-label="Исполнитель"
              />
            </div>
            <div className="seg" role="tablist" aria-label="Источник песни">
              <button
                type="button"
                role="tab"
                aria-selected={songTab === "link"}
                className={songTab === "link" ? "on" : ""}
                onClick={() => setSongTab("link")}
              >
                Ссылка
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={songTab === "file"}
                className={songTab === "file" ? "on" : ""}
                onClick={() => setSongTab("file")}
              >
                Свой файл
              </button>
            </div>
            {songTab === "link" ? (
              <input
                className="field-input"
                type="url"
                value={songUrl}
                onChange={(e) => setSongUrl(e.target.value)}
                placeholder="Ссылка YouTube или Spotify (необязательно)"
                aria-label="Ссылка на песню"
              />
            ) : (
              <label className="file-pick">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/*"
                  onChange={(e) => setSongFile(e.target.files?.[0] ?? null)}
                />
                {songFile
                  ? `♪ ${songFile.name}`
                  : "Выбрать mp3, m4a или wav — файл останется только в вашем браузере"}
              </label>
            )}
            <details className="more">
              <summary>Год, жанр и характер песни</summary>
              <div>
                <div className="row">
                  <input
                    className="field-input short"
                    value={songYear}
                    onChange={(e) =>
                      setSongYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="Год"
                    inputMode="numeric"
                    aria-label="Год"
                  />
                  <input
                    className="field-input"
                    value={songGenre}
                    onChange={(e) => setSongGenre(e.target.value)}
                    placeholder="Жанр"
                    aria-label="Жанр"
                  />
                </div>
                <div className="chips" aria-label="Характер песни">
                  {(
                    [
                      ["calm", "спокойная"],
                      ["medium", "средняя"],
                      ["energetic", "энергичная"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      type="button"
                      key={k}
                      className={songMood === k ? "chip on" : "chip"}
                      onClick={() => setSongMood(songMood === k ? "" : k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </details>
            <span className="hint">
              {songTab === "link"
                ? "Песню мы не скачиваем. Если ссылки нет, при просмотре зазвучит саундтрек, который система подберёт по настроению дня."
                : "Из файла считаем темп и энергию."}
            </span>
          </div>
        </section>

        <section className="form-step">
          <header>
            <span className="num">04</span>
            <h3>Чувства</h3>
            <p className="hint">
              Выберите до трёх. День редко бывает чем-то одним.
            </p>
          </header>
          <div className="body">
            <div className="chips emotion-chips" aria-label="Чувства дня">
              {EMOTION_ORDER.map((e) => (
                <button
                  type="button"
                  key={e}
                  className={emotions.includes(e) ? "chip on" : "chip"}
                  aria-pressed={emotions.includes(e)}
                  disabled={
                    !emotions.includes(e) && emotions.length >= MAX_EMOTIONS
                  }
                  onClick={() => toggleEmotion(e)}
                >
                  {EMOTION_LABELS[e]}
                </button>
              ))}
            </div>
            <details className="more">
              <summary>Уточнить: насыщенность, напряжение, пульс</summary>
              <div>
                <Scale
                  label="Насколько насыщенным был день"
                  value={scales.intensity}
                  onChange={setScale("intensity")}
                />
                <Scale
                  label="Внутреннее напряжение"
                  value={scales.tension}
                  onChange={setScale("tension")}
                />
                <Scale
                  label="Удовлетворённость днём"
                  value={scales.satisfaction}
                  onChange={setScale("satisfaction")}
                />
                <Scale
                  label="Хотели бы пережить снова"
                  value={scales.wouldRelive}
                  onChange={setScale("wouldRelive")}
                />
                <span className="hint">
                  Пульс — контекст для ритма и «ударов» камеры. Эмоции по пульсу
                  не определяются.
                </span>
                <div className="chips">
                  {(Object.keys(DEMO_PULSE_LABELS) as DemoPulse[]).map((k) => (
                    <button
                      type="button"
                      key={k}
                      className={
                        physio?.kind === "demo" &&
                        physio.avgHr === demoPulse(k).avgHr
                          ? "chip on"
                          : "chip"
                      }
                      onClick={() => {
                        setPhysio(demoPulse(k));
                        setPulseError("");
                      }}
                    >
                      Демо-пульс: {DEMO_PULSE_LABELS[k]}
                    </button>
                  ))}
                  <label className="chip file-chip">
                    Загрузить JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setPhysio(parsePulseJson(await file.text()));
                          setPulseError("");
                        } catch (err) {
                          setPulseError(
                            err instanceof Error
                              ? err.message
                              : "Не удалось прочитать файл",
                          );
                        }
                      }}
                    />
                  </label>
                  {physio && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setPhysio(undefined)}
                    >
                      Убрать пульс
                    </button>
                  )}
                </div>
                {physio && (
                  <span className="hint">
                    Пульс: {pulseLabel(physio)} · средний {physio.avgHr}, пик{" "}
                    {physio.maxHr} уд/мин
                  </span>
                )}
                {pulseError && <span className="error">{pulseError}</span>}
              </div>
            </details>
          </div>
        </section>

        <div className="submit-bar">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxWidth: 520,
            }}
          >
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Можно отправить текст на наш сервер для анализа. Без галочки
                анализ пройдёт прямо в браузере.
              </span>
            </label>
            {problems.length > 0 && (
              <span className="hint">Осталось: {problems.join("; ")}.</span>
            )}
            {error && <span className="error">Не получилось: {error}</span>}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={problems.length > 0 || running}
          >
            Создать моё воспоминание <span className="arrow">→</span>
          </button>
        </div>
      </form>
    </>
  );
}
