// Панель «Почему так выглядит» (раздел 8.12 ТЗ): причины, сгруппированные по источнику.
import type { DayRecord, Reason } from "@/lib/schema";
import { EMOTION_LABELS } from "@/lib/schema";

const GROUPS: { key: Reason["from"][number]; label: string }[] = [
  { key: "text", label: "Текст" },
  { key: "photo", label: "Фото" },
  { key: "music", label: "Музыка" },
  { key: "checkin", label: "Чек-ин" },
  { key: "physio", label: "Пульс" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function WhyPanel({ day }: { day: DayRecord }) {
  const { style, mood, audio, photo } = day;
  // Каждая причина попадает в группу своего первого источника
  const grouped = GROUPS.map((g) => ({
    ...g,
    items: style.reasons.filter((r) => r.from[0] === g.key),
  })).filter((g) => g.items.length);

  return (
    <div className="why">
      <div className="weights" aria-label="Веса техник">
        {(
          [
            ["paint", "живопись (Моне)"],
            ["geometry", "геометрия (Кандинский)"],
            ["film", "плёнка"],
          ] as const
        ).map(([k, l]) => (
          <div key={k} className="weight">
            <div className="weight-bar">
              <span style={{ width: pct(style.weights[k]) }} />
            </div>
            <span>
              {l} — {pct(style.weights[k])}
            </span>
          </div>
        ))}
      </div>

      <div className="swatches" aria-label="Палитра дня">
        {style.palette.map((c) => (
          <span key={c} style={{ background: c }} title={c} />
        ))}
      </div>

      <p className="hint">
        Настроение:{" "}
        {mood.emotions
          .map((e) => `${EMOTION_LABELS[e.emotion]} ${pct(e.weight)}`)
          .join(", ")}{" "}
        · песня {audio.bpm} BPM
        {audio.estimated ? " (оценочно)" : ""} · теплота фото{" "}
        {pct(photo.warmth)}
        {mood.source === "fallback"
          ? " · анализ текста по словарю (оценочно)"
          : ""}
      </p>

      {grouped.map((g) => (
        <section key={g.key}>
          <h3>{g.label}</h3>
          <ul>
            {g.items.map((r, k) => (
              <li key={k}>
                <b>{r.signal}</b> → {r.effect}.{" "}
                <span className="muted">{r.why}.</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {mood.fusionNotes.length > 0 && (
        <section>
          <h3>Как сложились сигналы</h3>
          <ul>
            {mood.fusionNotes.map((n, k) => (
              <li key={k}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="disclaimer">Это интерпретация настроения, а не диагноз.</p>
    </div>
  );
}
