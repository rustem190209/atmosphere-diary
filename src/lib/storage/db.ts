// Хранение дней в IndexedDB браузера (раздел 8.10 ТЗ). Библиотека idb-keyval — тонкая обёртка над IndexedDB.
import { createStore, del, entries, get, set, clear } from "idb-keyval";
import type { DayRecord } from "../schema";

// Своя «таблица» для дней; создаётся только в браузере
let store: ReturnType<typeof createStore> | null = null;
const days = () => (store ??= createStore("atmosphere-diary", "days"));

export async function saveDay(day: DayRecord): Promise<void> {
  await set(day.id, day, days());
}

export async function getDay(id: string): Promise<DayRecord | undefined> {
  return get<DayRecord>(id, days());
}

// Все дни, новые сверху
export async function listDays(): Promise<DayRecord[]> {
  const all = await entries<string, DayRecord>(days());
  return all
    .map(([, d]) => d)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDay(id: string): Promise<void> {
  await del(id, days());
}

export async function clearDiary(): Promise<void> {
  await clear(days());
}

export function newDayId(createdAt?: string): string {
  return `${new Date(createdAt ?? Date.now()).toLocaleDateString("sv-SE")}-${Math.random().toString(36).slice(2, 8)}`;
}
