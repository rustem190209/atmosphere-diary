// Карточка «Музыка дня»: что подобрала система по профилю дня, насколько совпала песня пользователя,
// и переключатель того, что звучит в воспоминании.
import { explainMatch, type MusicPick } from "@/lib/music/musicMatch";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function MusicCard({
  pick,
  source,
  onSource,
}: {
  pick: MusicPick;
  source: string; // "user" или id пресета
  onSource: (s: string) => void;
}) {
  const sys = explainMatch(pick.system, "system");
  const options = [pick.system, ...pick.runnersUp];
  const systemOn = source !== "user";

  return (
    <section className="music-card">
      <h3>Музыка дня</h3>
      <div className="tabs" role="tablist" aria-label="Что звучит">
        <button
          role="tab"
          aria-selected={!systemOn}
          className={!systemOn ? "on" : ""}
          onClick={() => onSource("user")}
        >
          Звучит: ваша песня
        </button>
        <button
          role="tab"
          aria-selected={systemOn}
          className={systemOn ? "on" : ""}
          onClick={() => onSource(pick.system.candidate.id)}
        >
          Подобрано системой
        </button>
      </div>

      {pick.user && (
        <p>
          Ваша песня совпала с профилем дня на <b>{pct(pick.user.score)}</b>
          {pick.user.candidate.estimated ? " (параметры оценочные)" : ""}.
        </p>
      )}
      <p>
        <b>{sys.headline}.</b>{" "}
        <span className="hint">Сгенерировано в браузере по профилю дня.</span>
      </p>
      {sys.agree.length > 0 && (
        <p className="hint">Совпадает: {sys.agree.join("; ")}.</p>
      )}
      {sys.contrast.length > 0 && (
        <p className="hint">Расходится: {sys.contrast.join("; ")}.</p>
      )}
      <p className="hint">{pick.targetText}.</p>

      <div className="chips" aria-label="Варианты саундтрека">
        <span className="hint">Варианты:</span>
        {options.map((r) => (
          <button
            key={r.candidate.id}
            className={source === r.candidate.id ? "chip on" : "chip"}
            onClick={() => onSource(r.candidate.id)}
          >
            {r.candidate.title} · {pct(r.score)}
          </button>
        ))}
      </div>
    </section>
  );
}
