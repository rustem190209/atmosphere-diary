"use client";
// Экран «Архив» (раздел 8.11 ТЗ): лента дней с постерами и поиск по названию.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DayRecord } from "@/lib/schema";
import { clearDiary, listDays } from "@/lib/storage/db";
import { demoAlreadySeeded, seedDemoDays } from "@/lib/demo/seed";

export default function ArchivePage() {
  const [days, setDays] = useState<DayRecord[] | null>(null);
  const [query, setQuery] = useState("");

  const [seeding, setSeeding] = useState("");

  // Загрузить примеры дней (при первом запуске — автоматически)
  async function addDemo() {
    setSeeding("Добавляю примеры дней…");
    try {
      await seedDemoDays((done, total) =>
        setSeeding(`Добавляю примеры дней: ${done} из ${total}…`),
      );
      setDays(await listDays());
    } catch (e) {
      console.error(e);
    }
    setSeeding("");
  }

  useEffect(() => {
    listDays()
      .then((list) => {
        setDays(list);
        if (list.length === 0 && !demoAlreadySeeded()) addDemo();
      })
      .catch(() => setDays([]));
  }, []);

  const posters = useMemo(
    () =>
      new Map(
        (days ?? []).map((d) => [
          d.id,
          d.poster ? URL.createObjectURL(d.poster) : "",
        ]),
      ),
    [days],
  );
  useEffect(
    () => () => posters.forEach((u) => u && URL.revokeObjectURL(u)),
    [posters],
  );

  const shown = (days ?? []).filter((d) =>
    d.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function clearAll() {
    if (!window.confirm("Удалить все дни из дневника? Это нельзя отменить."))
      return;
    await clearDiary();
    setDays([]);
  }

  return (
    <section>
      <h1>Архив</h1>
      <input
        className="search"
        type="search"
        placeholder="Поиск по названию"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {days === null && <p className="muted">Загружаю…</p>}
      {seeding && <p className="muted">{seeding}</p>}
      {days?.length === 0 && !seeding && (
        <p className="muted">
          Пока пусто. <Link href="/">Соберите первый день</Link> или{" "}
          <button className="link-btn" onClick={addDemo}>
            добавьте примеры
          </button>
          .
        </p>
      )}

      <div className="archive-grid">
        {shown.map((d) => (
          <Link key={d.id} href={`/day/${d.id}`} className="card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {posters.get(d.id) ? (
              <img src={posters.get(d.id)} alt="" />
            ) : (
              <div className="card-empty" />
            )}
            <span className="card-title">{d.title}</span>
            {d.demo && <span className="card-badge">пример</span>}
            <span className="card-date">
              {new Date(d.createdAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </Link>
        ))}
      </div>
      {days && days.length > 0 && shown.length === 0 && (
        <p className="muted">Ничего не нашлось.</p>
      )}

      {days && days.length > 0 && (
        <button className="btn-danger subtle" onClick={clearAll}>
          Очистить весь дневник
        </button>
      )}
    </section>
  );
}
