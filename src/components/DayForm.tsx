"use client";
// Форма «Новый день» (раздел 3 и 8.1 ТЗ): текст, фото, песня, чек-ин, согласие.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMOTIONS,
  EMOTION_LABELS,
  type CheckIn,
  type Emotion,
} from "@/lib/schema";
import type { SongMood } from "@/lib/audio/analyze";
import { buildDay, type Step } from "@/lib/pipeline";
import type { PhysioContext } from "@/lib/schema";
import { DEMO_PULSE_LABELS, demoPulse, parsePulseJson, pulseLabel, type DemoPulse } from "@/lib/physio";

const MAX_PHOTOS = 6;
const MAX_PHOTO_MB = 10;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const STEPS: { key: Step; label: string }[] = [
  { key: "text", label: "Читаю текст" },
  { key: "photo", label: "Смотрю фото" },
  { key: "music", label: "Слушаю песню" },
  { key: "draw", label: "Рисую" },
  { key: "save", label: "Сохраняю" },
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

export default function DayForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [songTab, setSongTab] = useState<"link" | "file">("link");
  const [songUrl, setSongUrl] = useState("");
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songYear, setSongYear] = useState("");
  const [songGenre, setSongGenre] = useState("");
  const [songMood, setSongMood] = useState<SongMood>("");
  const [useCheckIn, setUseCheckIn] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckIn>({
    intensity: 3,
    emotions: [],
    tension: 3,
    satisfaction: 3,
    wouldRelive: 3,
  });
  const [consent, setConsent] = useState(true);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [physio, setPhysio] = useState<PhysioContext | undefined>();
  const [pulseError, setPulseError] = useState("");

  // Превью фото: временные ссылки на файлы, удаляем при смене списка
  const previews = useMemo(
    () => photos.map((f) => URL.createObjectURL(f)),
    [photos],
  );
  useEffect(
    () => () => previews.forEach((u) => URL.revokeObjectURL(u)),
    [previews],
  );

  function addPhotos(list: FileList | null) {
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
    setCheckIn((c) => {
      if (c.emotions.includes(e))
        return { ...c, emotions: c.emotions.filter((x) => x !== e) };
      if (c.emotions.length >= 3) return c; // не больше трёх
      return { ...c, emotions: [...c.emotions, e] };
    });
  }

  const hasSong =
    songTab === "link" ? /^https?:\/\/\S+$/.test(songUrl.trim()) : !!songFile;
  const problems = [
    text.trim().length < 20 &&
      "напишите о дне хотя бы пару предложений (от 20 символов)",
    photos.length === 0 && "добавьте хотя бы одно фото",
    !hasSong &&
      (songTab === "link" ? "вставьте ссылку на песню" : "выберите аудиофайл"),
  ].filter(Boolean) as string[];

  function resetForm() {
    setText("");
    setPhotos([]);
    setPhotoError("");
    setSongUrl("");
    setSongFile(null);
    setSongTitle("");
    setSongYear("");
    setSongGenre("");
    setSongMood("");
    setUseCheckIn(false);
    setCheckIn({
      intensity: 3,
      emotions: [],
      tension: 3,
      satisfaction: 3,
      wouldRelive: 3,
    });
    setStep(null);
    setError("");
    setPhysio(undefined);
    setPulseError("");
    setFormKey((k) => k + 1); // пересоздать поля выбора файлов
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length || step) return;
    setError("");
    const [artist, title] =
      songTitle.includes("—") || songTitle.includes(" - ")
        ? songTitle.split(/\s+[—-]\s+/, 2).map((s) => s.trim())
        : ["", songTitle.trim()];
    const meta = {
      title: title || undefined,
      artist: artist || undefined,
      year: Number(songYear) > 1900 ? Number(songYear) : undefined,
      genre: songGenre.trim() || undefined,
      mood: songMood,
    };
    try {
      const day = await buildDay(
        {
          text: text.trim(),
          photos,
          song:
            songTab === "file" && songFile
              ? { kind: "file", file: songFile, meta }
              : { kind: "link", url: songUrl.trim(), meta },
          checkIn: useCheckIn ? checkIn : undefined,
          physio,
          consent,
        },
        setStep,
      );
      // Next.js сохраняет состояние страницы при возврате назад — очищаем форму для следующего дня
      resetForm();
      router.push(`/day/${day.id}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Что-то пошло не так");
      setStep(null);
    }
  }

  return (
    <form key={formKey} className="day-form" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Как прошёл день?</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Пишите как близкому другу: погода, свет, запахи, звуки, кто был рядом, что запомнилось…"
        />
        <span className="hint">{text.trim().length} символов</span>
      </label>

      <div className="field">
        <span className="field-label">Фото дня (1–6)</span>
        <div className="photo-grid">
          {previews.map((src, k) => (
            <div className="photo-thumb" key={src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Фото ${k + 1}`} />
              <button
                type="button"
                aria-label="Убрать фото"
                onClick={() => setPhotos(photos.filter((_, j) => j !== k))}
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="photo-add">
              <input
                type="file"
                accept={PHOTO_TYPES.join(",")}
                multiple
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <span>+ фото</span>
            </label>
          )}
        </div>
        {photoError && <span className="error">{photoError}</span>}
      </div>

      <div className="field">
        <span className="field-label">Песня дня</span>
        <div className="tabs" role="tablist">
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
            Файл
          </button>
        </div>
        {songTab === "link" ? (
          <input
            type="url"
            value={songUrl}
            onChange={(e) => setSongUrl(e.target.value)}
            placeholder="https://youtube.com/… или https://open.spotify.com/track/…"
          />
        ) : (
          <input
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/*"
            onChange={(e) => setSongFile(e.target.files?.[0] ?? null)}
          />
        )}
        <div className="row">
          <input
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Исполнитель — название (необязательно)"
          />
          <input
            value={songYear}
            onChange={(e) =>
              setSongYear(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="Год"
            inputMode="numeric"
            className="short"
          />
          <input
            value={songGenre}
            onChange={(e) => setSongGenre(e.target.value)}
            placeholder="Жанр"
            className="short"
          />
        </div>
        <div className="chips" aria-label="Характер песни">
          <span className="hint">Характер песни:</span>
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
        <span className="hint">
          {songTab === "link"
            ? "Песню мы не скачиваем: она играет во встроенном плеере сервиса. Темп оцениваем по жанру и характеру."
            : "Файл остаётся только в вашем браузере. Из него считаем темп и энергию."}
        </span>
      </div>

      <details
        className="field checkin"
        open={useCheckIn}
        onToggle={(e) => setUseCheckIn((e.target as HTMLDetailsElement).open)}
      >
        <summary>Чек-ин настроения (необязательно, ~20 секунд)</summary>
        <Scale
          label="Насколько насыщенным был день"
          value={checkIn.intensity}
          onChange={(v) =>
            setCheckIn({ ...checkIn, intensity: v as CheckIn["intensity"] })
          }
        />
        <div className="chips">
          <span className="hint">Что чувствовали (до 3):</span>
          {EMOTIONS.map((e) => (
            <button
              type="button"
              key={e}
              className={checkIn.emotions.includes(e) ? "chip on" : "chip"}
              disabled={
                !checkIn.emotions.includes(e) && checkIn.emotions.length >= 3
              }
              onClick={() => toggleEmotion(e)}
            >
              {EMOTION_LABELS[e]}
            </button>
          ))}
        </div>
        <Scale
          label="Внутреннее напряжение"
          value={checkIn.tension}
          onChange={(v) =>
            setCheckIn({ ...checkIn, tension: v as CheckIn["tension"] })
          }
        />
        <Scale
          label="Удовлетворённость днём"
          value={checkIn.satisfaction}
          onChange={(v) =>
            setCheckIn({
              ...checkIn,
              satisfaction: v as CheckIn["satisfaction"],
            })
          }
        />
        <Scale
          label="Хотели бы пережить снова"
          value={checkIn.wouldRelive}
          onChange={(v) =>
            setCheckIn({ ...checkIn, wouldRelive: v as CheckIn["wouldRelive"] })
          }
        />
      </details>

      <div className="field pulse">
        <span className="field-label">Пульс дня (необязательно)</span>
        <span className="hint">Контекст для ритма анимации и «ударов» камеры. Эмоции по пульсу не определяются.</span>
        <div className="chips">
          {(Object.keys(DEMO_PULSE_LABELS) as DemoPulse[]).map((k) => (
            <button type="button" key={k} className="chip" onClick={() => { setPhysio(demoPulse(k)); setPulseError(""); }}>
              Демо: {DEMO_PULSE_LABELS[k]}
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
                try { setPhysio(parsePulseJson(await file.text())); setPulseError(""); }
                catch (err) { setPulseError(err instanceof Error ? err.message : "Не удалось прочитать файл"); }
              }}
            />
          </label>
          {physio && <button type="button" className="chip" onClick={() => setPhysio(undefined)}>Убрать</button>}
        </div>
        {physio && <span className="hint">Пульс: {pulseLabel(physio)} · средний {physio.avgHr}, пик {physio.maxHr} уд/мин, точек: {physio.series.length}</span>}
        {pulseError && <span className="error">{pulseError}</span>}
      </div>

      <label className="consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Можно отправить текст на сервер для анализа. Без галочки анализ
          пройдёт прямо в браузере.
        </span>
      </label>

      {problems.length > 0 && (
        <p className="hint">
          Чтобы собрать воспоминание: {problems.join("; ")}.
        </p>
      )}
      {error && <p className="error">Не получилось: {error}</p>}

      <button
        type="submit"
        className="btn-primary"
        disabled={problems.length > 0 || !!step}
      >
        {step ? "Собираю…" : "Собрать воспоминание"}
      </button>

      {step && (
        <ol className="progress">
          {STEPS.map((s, k) => {
            const cur = STEPS.findIndex((x) => x.key === step);
            return (
              <li
                key={s.key}
                className={k < cur ? "done" : k === cur ? "now" : ""}
              >
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
    </form>
  );
}
