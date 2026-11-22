// Карточка воспоминания в ленте: кадр, дата, название, атмосфера, песня.
import Link from "next/link";
import type { DayRecord } from "@/lib/schema";
import { formatDate, songLabel } from "@/lib/useMemories";

export default function MemoryCard({
  day,
  poster,
  index = 0,
}: {
  day: DayRecord;
  poster?: string;
  index?: number;
}) {
  return (
    <Link
      href={`/day/${day.id}`}
      className="memory-card"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      <div className="frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster ? (
          <img src={poster} alt={`Кадр воспоминания «${day.title}»`} />
        ) : null}
        {day.demo && <span className="badge">пример</span>}
      </div>
      <div className="meta">
        <span>{formatDate(day.createdAt)}</span>
        <span>{day.audio.bpm} BPM</span>
      </div>
      <span className="title">{day.title}</span>
      <span className="atm">{day.mood.atmosphere}</span>
      <span className="song">♪ {songLabel(day)}</span>
    </Link>
  );
}
