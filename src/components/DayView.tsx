"use client";
// Экран «Кинематографичное воспоминание»: сцена слева, редакционная колонка справа —
// название, поэтичное описание, эмоциональный профиль, киноязык, музыка, оригиналы, «Почему так выглядит».
// id дня берём из адреса; сам день читаем из IndexedDB в браузере.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { DayRecord } from "@/lib/schema";
import { deleteDay, getDay } from "@/lib/storage/db";
import ScenePlayer from "@/components/ScenePlayer";
import WhyPanel from "@/components/WhyPanel";
import MusicCard from "@/components/MusicCard";
import { exportDayZip } from "@/lib/export/zip";
import { seedDemoDays } from "@/lib/demo/seed";
import {
  pickForDay,
  presetAudioSpec,
  presetById,
} from "@/lib/music/daySoundtrack";
import { mapToStyle } from "@/lib/style/mapToStyle";
import {
  cinematicDirection,
  emotionalProfile,
  emotionLabel,
  pct,
  poeticDescription,
  PRESETS,
} from "@/lib/cinema/direction";
import { formatDate, songLabel } from "@/lib/useMemories";

type Tab = "why" | "folder";

// Песню пользователя можно воспроизвести, только если есть файл или встроенный плеер по ссылке
const userSongPlayable = (d: DayRecord) =>
  !!d.input.songFile || !!d.audio.embedUrl;

function Originals({ day }: { day: DayRecord }) {
  const urls = useMemo(
    () => day.input.photos.map((p) => URL.createObjectURL(p)),
    [day],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="originals">
      {urls.map((u, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt={`Исходное фото ${k + 1}`} />
      ))}
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="pbar">
      <div className="top">
        <span>{label}</span>
        <span>{pct(value)}</span>
      </div>
      <div className="track">
        <span style={{ width: pct(value) }} />
      </div>
    </div>
  );
}

export default function DayView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [day, setDay] = useState<DayRecord | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("why");
  const [seeding, setSeeding] = useState(false);
  // Что звучит: "user" — песня пользователя, иначе id саундтрека, подобранного системой
  const [chosen, setChosen] = useState<string | null>(null);
  const pick = useMemo(
    () => (day ? pickForDay(day.mood, day.audio) : null),
    [day],
  );
  // Если песню пользователя нечем воспроизвести — по умолчанию звучит подобранный саундтрек
  const source =
    chosen ??
    (day && pick && !userSongPlayable(day) ? pick.system.candidate.id : "user");
  // Если звучит подобранный саундтрек — стиль пересчитывается от его темпа и энергии
  const shown = useMemo(() => {
    if (!day || source === "user") return day;
    const c = presetById(source);
    if (!c) return day;
    const audio = presetAudioSpec(c);
    return {
      ...day,
      audio,
      style: mapToStyle(
        day.mood,
        day.photo,
        audio,
        day.input.checkIn,
        !!day.input.physio,
      ),
    };
  }, [day, source]);

  useEffect(() => {
    const dayId = decodeURIComponent(id);
    (async () => {
      let d = await getDay(dayId);
      // Ссылка на пример, а в этом браузере примеров ещё нет — загружаем их и открываем день
      if (!d && dayId.startsWith("demo-")) {
        setSeeding(true);
        await seedDemoDays();
        d = await getDay(dayId);
        setSeeding(false);
      }
      setDay(d ?? null);
    })().catch(() => setDay(null));
  }, [id]);

  async function remove() {
    if (
      !day ||
      !window.confirm(
        `Удалить воспоминание «${day.title}» целиком? Это нельзя отменить.`,
      )
    )
      return;
    await deleteDay(day.id);
    router.push("/archive");
  }

  async function downloadZip() {
    if (!day) return;
    const { blob, filename } = await exportDayZip(day);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (day === undefined)
    return (
      <p
        className="canvas-msg"
        style={{ position: "static", padding: "120px 0" }}
      >
        {seeding
          ? "Загружаю примеры (первый запуск, ~15 секунд)…"
          : "Открываю воспоминание…"}
      </p>
    );
  if (day === null)
    return (
      <div className="empty">
        <span className="display">Воспоминание не найдено</span>
        <p className="muted">
          Возможно, его удалили или создали в другом браузере — дни хранятся на
          устройстве.
        </p>
        <Link href="/archive" className="btn">
          В архив
        </Link>
      </div>
    );

  const view = shown ?? day;
  const profile = emotionalProfile(view);
  const direction = cinematicDirection(view, profile);
  const layers = view.mood.emotions;

  return (
    <article className="memory">
      <div className="memory-stage">
        {/* key: при смене саундтрека плеер пересоздаётся с новым стилем */}
        <ScenePlayer
          key={source}
          day={view}
          soundtrack={source === "user" ? undefined : presetById(source)}
        />
      </div>

      <div className="memory-info">
        <span className="eyebrow">
          {formatDate(day.createdAt)} · {direction.visualMood}
        </span>
        <h1>{day.title}</h1>
        <span className="atm">{day.mood.atmosphere}</span>
        <p className="poem">{poeticDescription(day)}</p>

        <section className="block">
          <span className="eyebrow">Эмоциональные слои</span>
          <div className="layers">
            {layers.map((l) => (
              <span
                key={l.emotion}
                className={
                  l.emotion === profile.primaryEmotion
                    ? "layer primary"
                    : "layer"
                }
              >
                {emotionLabel(l.emotion)}
                <b>{pct(l.weight)}</b>
              </span>
            ))}
          </div>
          <div className="profile-bars" style={{ marginTop: 26 }}>
            <Bar label="Интенсивность" value={profile.emotionalIntensity} />
            <Bar label="Энергия" value={profile.energy} />
            <Bar label="Теплота" value={profile.warmth} />
            <Bar label="Ностальгия" value={profile.nostalgia} />
            <Bar label="Напряжение" value={profile.tension} />
            <Bar
              label="Динамика движения"
              value={direction.movementIntensity}
            />
          </div>
          {day.mood.contradiction.present && (
            <p className="hint" style={{ marginTop: 18 }}>
              {day.mood.contradiction.note} — в кадре это двойная экспозиция.
            </p>
          )}
        </section>

        <section className="block">
          <span className="eyebrow">Киноязык дня</span>
          <div className="preset-name">{direction.visualMood}</div>
          <p className="muted">{PRESETS[direction.preset].idea}.</p>
          <dl className="direction" style={{ marginTop: 26 }}>
            <div>
              <dt>Камера</dt>
              <dd>{direction.cameraMovement}</dd>
            </div>
            <div>
              <dt>Свет</dt>
              <dd>{direction.lighting}</dd>
            </div>
            <div>
              <dt>Переходы</dt>
              <dd>{direction.transitionStyle}</dd>
            </div>
            <div>
              <dt>Ритм</dt>
              <dd>{direction.rhythm}</dd>
            </div>
            <div>
              <dt>Плёночное зерно</dt>
              <dd>{pct(direction.filmGrain)}</dd>
            </div>
            <div>
              <dt>Техники</dt>
              <dd>
                живопись {pct(view.style.weights.paint)} · геометрия{" "}
                {pct(view.style.weights.geometry)} · плёнка{" "}
                {pct(view.style.weights.film)}
              </dd>
            </div>
          </dl>
          <div className="palette" aria-label="Палитра дня">
            {direction.colorPalette.map((c) => (
              <span key={c} style={{ background: c }} title={c} />
            ))}
          </div>
        </section>

        <section className="block">
          <span className="eyebrow">Музыка</span>
          <div className="music-now">♪ {songLabel(day)}</div>
          <p className="hint" style={{ margin: "6px 0 18px" }}>
            {day.audio.bpm} BPM{day.audio.estimated ? " (оценочно)" : ""}
            {day.audio.genre ? ` · ${day.audio.genre}` : ""}
            {!userSongPlayable(day)
              ? " · песня указана без ссылки и файла, поэтому звучит саундтрек, подобранный системой"
              : ""}
          </p>
          {pick && (
            <MusicCard pick={pick} source={source} onSource={setChosen} />
          )}
        </section>

        <section className="block">
          <span className="eyebrow">Исходные кадры</span>
          <Originals day={day} />
        </section>

        <section className="block">
          <div className="tabs" role="tablist">
            {(
              [
                ["why", "Почему так выглядит"],
                ["folder", "Папка дня"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </div>
          {tab === "why" ? (
            <WhyPanel day={view} pick={pick ?? undefined} source={source} />
          ) : (
            <div className="folder">
              <h3>Запись</h3>
              <p className="day-text">{day.input.text}</p>
              <h3>Песня</h3>
              <p className="muted">
                {songLabel(day)}
                {day.audio.year ? `, ${day.audio.year}` : ""}
                {day.input.songUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      className="link-btn"
                      href={day.input.songUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      открыть в сервисе
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          )}
        </section>

        <div className="day-actions">
          <Link href="/archive" className="btn-secondary">
            ← Архив
          </Link>
          <div className="day-actions-right">
            <button className="btn-secondary" onClick={downloadZip}>
              Скачать папку (ZIP)
            </button>
            <button className="btn-danger" onClick={remove}>
              Удалить
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
