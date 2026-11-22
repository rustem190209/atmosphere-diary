"use client";
// Главная: идентичность продукта, крупный кинокадр последнего воспоминания, как это работает, недавние воспоминания.
import Link from "next/link";
import MemoryCard from "@/components/MemoryCard";
import { formatDate, useMemories } from "@/lib/useMemories";

const STEPS = [
  {
    n: "01",
    t: "Запишите день",
    d: "Как рассказали бы близкому: свет, погода, люди рядом, мелочи, которые запомнились.",
  },
  {
    n: "02",
    t: "Добавьте фото и песню",
    d: "Палитра берётся из ваших кадров, ритм монтажа — из музыки, которая тогда звучала.",
  },
  {
    n: "03",
    t: "Отметьте чувства",
    d: "Несколько эмоций сразу: день редко бывает только радостным или только грустным.",
  },
  {
    n: "04",
    t: "Получите фильм",
    d: "20–30 секунд кино о вашем дне — с объяснением, почему он выглядит именно так.",
  },
];

export default function HomePage() {
  const { days, posters, seeding } = useMemories();
  const hero = days?.[0];
  const recent = (days ?? []).slice(0, 4);

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Кинематографичный дневник</span>
          <h1>
            Фото помнят, как выглядел день.{" "}
            <em>Мы сохраняем, как он ощущался.</em>
          </h1>
          <p className="hero-lead">
            Атмосфера превращает запись о дне, ваши фотографии и песню в
            короткий фильм-воспоминание: цвет, свет, движение камеры и ритм
            подбираются под настроение дня.
          </p>
          <div className="hero-actions">
            <Link href="/create" className="btn btn-primary">
              Создать воспоминание <span className="arrow">→</span>
            </Link>
            <Link href="/archive" className="btn btn-ghost">
              Смотреть архив
            </Link>
          </div>
        </div>

        <Link
          href={hero ? `/day/${hero.id}` : "/create"}
          className="hero-visual"
          aria-label={hero ? `Открыть «${hero.title}»` : "Создать воспоминание"}
        >
          {hero && posters.get(hero.id) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posters.get(hero.id)} alt="" />
          ) : null}
          {!hero && (
            <span className="canvas-msg">
              {seeding || "Здесь появится ваше первое воспоминание"}
            </span>
          )}
          {hero && (
            <div className="hero-caption">
              <div>
                <span className="eyebrow">{formatDate(hero.createdAt)}</span>
                <div className="display">{hero.title}</div>
              </div>
              <span className="hand">{hero.mood.atmosphere}</span>
            </div>
          )}
        </Link>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Как это работает</span>
            <h2>Четыре шага до фильма о вашем дне</h2>
          </div>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span className="num">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">Недавние воспоминания</span>
            <h2>Страницы одного дневника</h2>
          </div>
          {days && days.length > 0 && (
            <Link href="/archive" className="btn btn-ghost">
              Весь архив <span className="arrow">→</span>
            </Link>
          )}
        </div>
        {seeding && <p className="hint">{seeding}</p>}
        {days && days.length === 0 && !seeding && (
          <div className="empty">
            <span className="display">Пока здесь тихо</span>
            <p className="muted">Первое воспоминание займёт пару минут.</p>
            <Link href="/create" className="btn btn-primary">
              Создать воспоминание
            </Link>
          </div>
        )}
        <div className="memory-grid">
          {recent.map((d, i) => (
            <MemoryCard
              key={d.id}
              day={d}
              poster={posters.get(d.id)}
              index={i}
            />
          ))}
        </div>
      </section>
    </>
  );
}
