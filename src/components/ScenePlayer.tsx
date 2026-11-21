"use client";
// Плеер воспоминания: холст 9:16 + музыка. Звук включается только по кнопке Play.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DayRecord } from "@/lib/schema";
import type { Scene } from "@/lib/render/types";
import { H, W } from "@/lib/render/types";
import { drawFrame, prepareScene, PREVIEW_SCALE } from "@/lib/render/engine";

export default function ScenePlayer({ day }: { day: DayRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const rafRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [loadError, setLoadError] = useState("");

  const duration = day.style.timeline.duration;

  // Подготовка сцены и первого кадра
  useEffect(() => {
    let cancelled = false;
    prepareScene(day)
      .then((s) => {
        if (cancelled) return s.images.forEach((b) => b.close());
        sceneRef.current = s;
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
          drawFrame(ctx, s, { t: Math.min(2, duration - 3), amp: 0 });
        }
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setLoadError("Не удалось подготовить сцену");
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.images.forEach((b) => b.close());
      sceneRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [day, duration]);

  // Временная ссылка на аудиофайл дня; удаляем, когда день сменился
  const songSrc = useMemo(
    () =>
      day.input.songFile ? URL.createObjectURL(day.input.songFile) : undefined,
    [day],
  );
  useEffect(
    () => () => {
      if (songSrc) URL.revokeObjectURL(songSrc);
    },
    [songSrc],
  );

  // Начало звучания: середина песни, как при анализе темпа (там обычно припев)
  function songStart(a: HTMLAudioElement) {
    return a.duration > 40 ? Math.max(0, a.duration / 2 - 15) : 0;
  }

  async function play() {
    const s = sceneRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!s || !ctx) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(true);
    const a = audioRef.current;
    let startClock = performance.now();
    let offset = 0;

    if (a && songSrc) {
      // Анализатор громкости: зерно и фигуры реагируют на музыку
      if (!audioCtxRef.current) {
        const actx = new AudioContext();
        const srcNode = actx.createMediaElementSource(a);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        srcNode.connect(analyser);
        analyser.connect(actx.destination);
        audioCtxRef.current = actx;
        analyserRef.current = analyser;
      }
      await audioCtxRef.current.resume();
      offset = songStart(a);
      a.currentTime = offset;
      a.volume = 1;
      try {
        await a.play();
      } catch (e) {
        console.warn("Браузер не дал запустить звук", e);
      }
      startClock = performance.now();
    } else if (day.audio.embedUrl) {
      setShowEmbed(true);
    }

    const buf = new Uint8Array(256);
    const tick = () => {
      // Время берём из аудио, если оно играет, — так картинка не расходится с музыкой
      const t =
        a && songSrc && !a.paused
          ? a.currentTime - offset
          : (performance.now() - startClock) / 1000;
      let amp = 0;
      if (analyserRef.current && a && !a.paused) {
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        amp = Math.min(1, Math.sqrt(sum / buf.length) * 3);
      }
      // Музыка мягко затихает на финальном кадре
      if (a && songSrc && t > duration - 2)
        a.volume = Math.max(0, (duration - t) / 2);
      drawFrame(ctx, s, { t, amp });
      if (t < duration) rafRef.current = requestAnimationFrame(tick);
      else {
        a?.pause();
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    setPlaying(false);
  }

  const embedSrc = day.audio.embedUrl
    ? day.audio.embedUrl +
      (day.audio.embedUrl.includes("youtube") ? "?autoplay=1" : "")
    : undefined;

  return (
    <div className="player">
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={W * PREVIEW_SCALE}
          height={H * PREVIEW_SCALE}
          aria-label={`Воспоминание: ${day.title}`}
        />
        {!playing && ready && (
          <button
            className="play-btn"
            onClick={play}
            aria-label="Смотреть со звуком"
          >
            ▶
          </button>
        )}
        {!ready && !loadError && (
          <div className="canvas-msg">Готовлю сцену…</div>
        )}
        {loadError && <div className="canvas-msg">{loadError}</div>}
      </div>
      <div className="player-bar">
        {playing ? (
          <button onClick={stop}>■ Стоп</button>
        ) : (
          <span className="hint">{duration} секунд · звук по кнопке ▶</span>
        )}
      </div>
      {songSrc && <audio ref={audioRef} src={songSrc} preload="auto" />}
      {day.audio.source === "link" && day.input.songUrl && (
        <div className="embed">
          {showEmbed && embedSrc ? (
            <iframe
              src={embedSrc}
              title="Песня дня"
              allow="autoplay; encrypted-media"
              height={day.audio.embedUrl?.includes("spotify") ? 152 : 200}
            />
          ) : (
            <p className="hint">
              Песня по ссылке откроется во встроенном плеере после нажатия ▶.
            </p>
          )}
          <a
            href={day.input.songUrl}
            target="_blank"
            rel="noreferrer"
            className="hint"
          >
            Открыть песню в сервисе ↗
          </a>
        </div>
      )}
    </div>
  );
}
