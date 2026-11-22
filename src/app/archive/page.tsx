"use client";
// Архив воспоминаний: лента по датам, поиск по названию, очистка дневника.
import Link from "next/link";
import { useState } from "react";
import MemoryCard from "@/components/MemoryCard";
import { clearDiary } from "@/lib/storage/db";
import { useMemories } from "@/lib/useMemories";

export default function ArchivePage() {
  const { days, setDays, posters, seeding, addDemo } = useMemories();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = (days ?? []).filter(
    (d) =>
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.mood.atmosphere.toLowerCase().includes(q),
  );

  async function clearAll() {
    if (
      !window.confirm(
        "Удалить все воспоминания из этого браузера? Это нельзя отменить.",
      )
    )
      return;
    await clearDiary();
    setDays([]);
  }

  return (
    <section>
      <div className="create-head">
        <span className="eyebrow">Архив</span>
        <h1>Ваши дни</h1>
        <p>
          Каждая страница — отдельная папка дня: текст, фото, песня и готовый
          фильм.
        </p>
      </div>

      <div className="section-head">
        <input
          className="search"
          type="search"
          placeholder="Найти по названию или настроению"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="hint">
          {days
            ? `${days.length} ${days.length === 1 ? "воспоминание" : "воспоминаний"}`
            : ""}
        </span>
      </div>

      {days === null && <p className="hint">Открываю архив…</p>}
      {seeding && <p className="hint">{seeding}</p>}
      {days?.length === 0 && !seeding && (
        <div className="empty">
          <span className="display">Архив пока пуст</span>
          <p className="muted">
            Создайте первое воспоминание или посмотрите примеры.
          </p>
          <div className="hero-actions">
            <Link href="/create" className="btn btn-primary">
              Создать воспоминание
            </Link>
            <button className="btn" onClick={addDemo}>
              Загрузить примеры
            </button>
          </div>
        </div>
      )}

      <div className="memory-grid">
        {shown.map((d, i) => (
          <MemoryCard key={d.id} day={d} poster={posters.get(d.id)} index={i} />
        ))}
      </div>
      {days && days.length > 0 && shown.length === 0 && (
        <p className="muted">Ничего не нашлось.</p>
      )}

      {days && days.length > 0 && (
        <div className="day-actions">
          <button className="btn-secondary" onClick={addDemo}>
            Добавить примеры
          </button>
          <button className="btn-danger" onClick={clearAll}>
            Очистить дневник
          </button>
        </div>
      )}
    </section>
  );
}
