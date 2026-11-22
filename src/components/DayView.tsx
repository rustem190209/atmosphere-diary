"use client";
// Экран «Воспоминание» (раздел 3 ТЗ): плеер, папка дня, «Почему так выглядит».
// id дня берём из адреса; сам день читаем из IndexedDB в браузере.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { DayRecord } from "@/lib/schema";
import { deleteDay, getDay } from "@/lib/storage/db";
import ScenePlayer from "@/components/ScenePlayer";
import WhyPanel from "@/components/WhyPanel";
import { exportDayZip } from "@/lib/export/zip";
import { seedDemoDays } from "@/lib/demo/seed";
import MusicCard from "@/components/MusicCard";
import { pickForDay, presetAudioSpec, presetById } from "@/lib/music/daySoundtrack";
import { mapToStyle } from "@/lib/style/mapToStyle";

type Tab = "memory" | "folder" | "why";

function Folder({ day }: { day: DayRecord }) {
  const photoUrls = useMemo(
    () => day.input.photos.map((p) => URL.createObjectURL(p)),
    [day],
  );
  useEffect(
    () => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)),
    [photoUrls],
  );
  const a = day.audio;
  return (
    <div className="folder">
      <h3>Текст</h3>
      <p className="day-text">{day.input.text}</p>
      <h3>Фото</h3>
      <div className="photo-grid">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photoUrls.map((u, k) => (
          <div className="photo-thumb" key={u}>
            <img src={u} alt={`Фото ${k + 1}`} />
          </div>
        ))}
      </div>
      <h3>Песня</h3>
      <p>
        {[a.artist, a.title].filter(Boolean).join(" — ") || "Без названия"}
        {a.year ? `, ${a.year}` : ""}
        {a.genre ? ` · ${a.genre}` : ""} · {a.bpm} BPM
        {a.estimated ? " (оценочно)" : ""}
      </p>
      {day.input.songUrl && (
        <a href={day.input.songUrl} target="_blank" rel="noreferrer">
          {day.input.songUrl}
        </a>
      )}
      {day.input.songFile && (
        <p className="hint">Аудиофайл хранится только в этом браузере.</p>
      )}
    </div>
  );
}

export default function DayView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [day, setDay] = useState<DayRecord | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("memory");
  const [seeding, setSeeding] = useState(false);
  // Что звучит: "user" — песня пользователя, иначе id саундтрека, подобранного системой
  const [source, setSource] = useState("user");
  const pick = useMemo(() => (day ? pickForDay(day.mood, day.audio) : null), [day]);
  // Если звучит подобранный саундтрек — стиль пересчитывается от его темпа и энергии
  const shown = useMemo(() => {
    if (!day || source === "user") return day;
    const c = presetById(source);
    if (!c) return day;
    const audio = presetAudioSpec(c);
    return { ...day, audio, style: mapToStyle(day.mood, day.photo, audio, day.input.checkIn, !!day.input.physio) };
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
        `Удалить день «${day.title}» целиком? Это нельзя отменить.`,
      )
    )
      return;
    await deleteDay(day.id);
    router.push("/archive");
  }

  // Скачать папку дня одним архивом: текст, фото, песня (ссылка), постер, «почему»
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
    return <p className="muted">{seeding ? "Загружаю примеры дней (первый запуск, ~15 секунд)…" : "Открываю день…"}</p>;
  if (day === null)
    return (
      <section>
        <h1>День не найден</h1>
        <p className="muted">
          Возможно, он был удалён или создан в другом браузере.{" "}
          <Link href="/archive">В архив</Link>
        </p>
      </section>
    );

  const date = new Date(day.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="day">
      <p className="muted">{date}</p>
      <h1>{day.title}</h1>
      <p className="signature">{day.mood.atmosphere}</p>

      <div className="tabs" role="tablist">
        {(
          [
            ["memory", "Воспоминание"],
            ["folder", "Папка дня"],
            ["why", "Почему так выглядит"],
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

      {/* Плеер не размонтируем при смене вкладки, чтобы музыка не обрывалась */}
      <div hidden={tab !== "memory"}>
        {/* key: при смене саундтрека плеер пересоздаётся с новым стилем */}
        <ScenePlayer key={source} day={shown ?? day} soundtrack={source === "user" ? undefined : presetById(source)} />
        {pick && <MusicCard pick={pick} source={source} onSource={setSource} />}
      </div>
      {tab === "folder" && <Folder day={day} />}
      {tab === "why" && <WhyPanel day={shown ?? day} pick={pick ?? undefined} source={source} />}

      <div className="day-actions">
        <Link href="/archive">← В архив</Link>
        <div className="day-actions-right">
          <button className="btn-secondary" onClick={downloadZip}>
            Скачать папку (ZIP)
          </button>
          <button className="btn-danger" onClick={remove}>
            Удалить день
          </button>
        </div>
      </div>
    </section>
  );
}
