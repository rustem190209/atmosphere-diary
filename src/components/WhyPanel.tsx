// Панель «Почему так выглядит» (раздел 8.12 ТЗ): Текст · Фото · Музыка · Опрос и пульс · Камера.
import type { DayRecord, PhysioContext, Reason } from "@/lib/schema";
import { EMOTION_LABELS } from "@/lib/schema";
import { explainMatch, type MusicPick } from "@/lib/music/musicMatch";
import { cameraSummary } from "@/lib/render/cameraPlan";
import { physioPeaks, pulseLabel } from "@/lib/physio";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Reasons({ items }: { items: Reason[] }) {
  return (
    <ul>
      {items.map((r, k) => (
        <li key={k}>
          <b>{r.signal}</b> → {r.effect}.{" "}
          <span className="muted">{r.why}.</span>
        </li>
      ))}
    </ul>
  );
}

// Мини-график пульса с отметками пиков
export function PulseChart({ physio }: { physio: PhysioContext }) {
  const s = physio.series;
  const t0 = s[0].t,
    t1 = s[s.length - 1].t || 1;
  const lo = Math.min(...s.map((p) => p.hr)) - 5,
    hi = Math.max(...s.map((p) => p.hr)) + 5;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * 560;
  const y = (hr: number) => 80 - ((hr - lo) / (hi - lo || 1)) * 70;
  const d = s
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.hr).toFixed(1)}`)
    .join(" ");
  return (
    <figure>
      <svg
        className="pulse-chart"
        viewBox="0 0 560 90"
        role="img"
        aria-label={`График пульса, ${pulseLabel(physio)}`}
      >
        {physioPeaks(physio).map((p, k) => (
          <line
            key={k}
            x1={p * 560}
            x2={p * 560}
            y1={4}
            y2={86}
            stroke="var(--accent)"
            strokeDasharray="3 4"
          />
        ))}
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <figcaption className="hint">
        Пульс: {pulseLabel(physio)} · средний {physio.avgHr}, пик {physio.maxHr}{" "}
        уд/мин · пунктир — пики дня (на них «удары» камеры)
      </figcaption>
    </figure>
  );
}

export default function WhyPanel({
  day,
  pick,
  source,
}: {
  day: DayRecord;
  pick?: MusicPick;
  source?: string;
}) {
  const { style, mood, audio, photo } = day;
  const by = (k: Reason["from"][number]) =>
    style.reasons.filter((r) => r.from[0] === k);
  const cam = cameraSummary(day);
  const sys = pick ? explainMatch(pick.system, "system") : null;
  const usr = pick?.user ? explainMatch(pick.user, "user") : null;
  const ci = day.input.checkIn;

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
        · уверенность {pct(mood.confidence)}
        {mood.source === "fallback"
          ? " · анализ текста по словарю (оценочно)"
          : ""}
      </p>

      <section>
        <h3>Текст</h3>
        <Reasons items={by("text")} />
      </section>

      <section>
        <h3>Фото</h3>
        <p className="hint">
          Фото: {photo.count}, теплота {pct(photo.warmth)}, яркость{" "}
          {pct(photo.brightness)}.
        </p>
        <Reasons items={by("photo")} />
      </section>

      <section>
        <h3>Музыка</h3>
        <p className="hint">
          Звучит:{" "}
          {source && source !== "user"
            ? `подобрано системой — «${audio.title}» (сгенерировано в браузере)`
            : "ваша песня"}{" "}
          · {audio.bpm} BPM
          {audio.estimated ? " (оценочно)" : ""}
        </p>
        {sys && (
          <>
            <p>
              <b>{sys.headline}.</b>
            </p>
            {sys.agree.length > 0 && (
              <p className="hint">Совпадает: {sys.agree.join("; ")}.</p>
            )}
            {sys.contrast.length > 0 && (
              <p className="hint">Расходится: {sys.contrast.join("; ")}.</p>
            )}
          </>
        )}
        {usr && (
          <p>
            {usr.headline}.
            {usr.contrast.length ? (
              <span className="hint">
                {" "}
                Расходится: {usr.contrast.join("; ")}.
              </span>
            ) : null}
          </p>
        )}
        <Reasons items={by("music")} />
      </section>

      <section>
        <h3>Опрос и пульс</h3>
        {!ci && !day.input.physio && (
          <p className="hint">
            Опрос и пульс не заполнялись — профиль дня построен по тексту, фото
            и песне.
          </p>
        )}
        {ci && (
          <p className="hint">
            Опрос: насыщенность {ci.intensity}/5, напряжение {ci.tension}/5,
            удовлетворённость {ci.satisfaction}/5
            {ci.emotions.length
              ? `, эмоции: ${ci.emotions.map((e) => EMOTION_LABELS[e]).join(", ")}`
              : ""}
            .
          </p>
        )}
        {day.input.physio && <PulseChart physio={day.input.physio} />}
        <Reasons items={[...by("checkin"), ...by("physio")]} />
        {mood.fusionNotes.length > 0 && (
          <ul>
            {mood.fusionNotes.map((n, k) => (
              <li key={k}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Камера</h3>
        <p>
          {cam.shots}{" "}
          {cam.shots === 1 ? "план" : cam.shots < 5 ? "плана" : "планов"} из{" "}
          {cam.photos} фото ({cam.kinds} вида: общий, средний, деталь); смена
          кадра ≈ каждые {cam.every.toFixed(1)} с = {cam.beats}{" "}
          {cam.beats === 1 ? "доля" : cam.beats < 5 ? "доли" : "долей"} такта
          песни; ударов камеры на бит и пики пульса: {cam.punches}.
        </p>
        <p className="hint">
          Фон и объект на фото двигаются с разной скоростью — это имитация
          глубины, а не 3D.
        </p>
      </section>

      <p className="disclaimer">Это интерпретация настроения, а не диагноз.</p>
    </div>
  );
}
