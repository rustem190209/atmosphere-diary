"use client";
// Список воспоминаний из браузера + постеры; при первом запуске загружает примеры дней.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DayRecord } from "./schema";
import { listDays } from "./storage/db";
import { demoAlreadySeeded, seedDemoDays } from "./demo/seed";

export function useMemories() {
  const [days, setDays] = useState<DayRecord[] | null>(null);
  const [seeding, setSeeding] = useState("");

  const addDemo = useCallback(async () => {
    setSeeding("Загружаю примеры воспоминаний…");
    try {
      await seedDemoDays((done, total) =>
        setSeeding(`Загружаю примеры воспоминаний: ${done} из ${total}…`),
      );
      setDays(await listDays());
    } catch (e) {
      console.error(e);
    }
    setSeeding("");
  }, []);

  useEffect(() => {
    listDays()
      .then((list) => {
        setDays(list);
        if (list.length === 0 && !demoAlreadySeeded()) addDemo();
      })
      .catch(() => setDays([]));
  }, [addDemo]);

  // Временные ссылки на постеры; освобождаем при смене списка
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

  return { days, setDays, posters, seeding, addDemo };
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export const songLabel = (d: DayRecord) =>
  [d.audio.artist, d.audio.title].filter(Boolean).join(" — ") || "Песня дня";
