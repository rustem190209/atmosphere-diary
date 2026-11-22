"use client";
// Экран анализа: этапы сменяются по мере реальной работы пайплайна.
// Этапы показываются не быстрее чем раз в ~0,9 с, чтобы их можно было прочитать.
import { useEffect, useState } from "react";
import type { Step } from "@/lib/pipeline";

export const STAGES = [
  "Понимаю вашу историю",
  "Исследую эмоциональные слои",
  "Считываю визуальную атмосферу",
  "Перевожу эмоции на язык кино",
  "Собираю воспоминание",
];

// Куда может дойти показ, если пайплайн на этом шаге
const TARGET: Record<Step | "done", number> = {
  text: 0,
  photo: 2,
  music: 3,
  draw: 3,
  save: 4,
  done: 5,
};

export default function AnalysisOverlay({
  step,
  done,
  photo,
  onFinished,
}: {
  step: Step | null;
  done: boolean;
  photo?: string;
  onFinished: () => void;
}) {
  const [shown, setShown] = useState(0);
  const target = done ? TARGET.done : step ? TARGET[step] : 0;

  useEffect(() => {
    if (shown >= 5) {
      const t = setTimeout(onFinished, 500);
      return () => clearTimeout(t);
    }
    if (shown >= target) return;
    const t = setTimeout(() => setShown((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [shown, target, onFinished]);

  const current = Math.min(shown, STAGES.length - 1);
  return (
    <div className="analysis" role="status" aria-live="polite">
      {photo && (
        <div className="bgimg" style={{ backgroundImage: `url(${photo})` }} />
      )}
      <div className="inner">
        <span className="eyebrow">Создаём воспоминание</span>
        <h2 key={current}>
          {shown >= 5 ? "Воспоминание готово" : `${STAGES[current]}…`}
        </h2>
        <ol>
          {STAGES.map((s, i) => (
            <li
              key={s}
              className={i < shown ? "done" : i === shown ? "now" : ""}
            >
              <span className="dot" />
              {s}
            </li>
          ))}
        </ol>
        <div className="bar">
          <span style={{ width: `${(shown / 5) * 100}%` }} />
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          Режим демонстрации: анализ по ключевым словам, выбранным чувствам,
          цветам фото и темпу песни — прямо в браузере.
        </p>
      </div>
    </div>
  );
}
