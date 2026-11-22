// Общие типы и константы рендерера. Холст в логических координатах 1080×1920 (9:16).
import type { MoodSpec, StyleParams } from "../schema";
import type { PreparedPhoto, ShotPlan } from "./virtualCamera";

export const W = 1080;
export const H = 1920;
export const MARGIN = 64;
// Рамка фото 4:5 — постоянный элемент, положение не меняется от дня к дню
export const FRAME = {
  x: MARGIN,
  y: 210,
  w: W - MARGIN * 2,
  h: Math.round(((W - MARGIN * 2) * 5) / 4),
};

export interface Stroke {
  u: number;
  v: number; // положение в кадре 0..1
  angle: number;
  len: number;
  width: number;
  bend: number;
  color: string;
  order: number; // order 0..1 — когда мазок появляется
}

export interface Shape {
  kind: "circle" | "ring" | "line" | "triangle" | "half";
  x: number;
  y: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  fill: boolean;
  phase: number;
}

export interface Fonts {
  serif: string;
  sans: string;
  hand: string;
}

export interface Scene {
  style: StyleParams;
  mood: MoodSpec;
  title: string;
  dateLabel: string;
  bpm: number;
  images: ImageBitmap[];
  prepared: PreparedPhoto[]; // фото, подготовленные для «виртуального оператора» (фон + объект)
  shots: ShotPlan[]; // план съёмки: планы, тайминги, удары камеры
  strokes: Stroke[][]; // мазки для каждого фото
  shapes: Shape[];
  grain: HTMLCanvasElement;
  paper: HTMLCanvasElement;
  dark: boolean; // тёмный фон (ночь, напряжение) или светлая «бумага»
  ink: string; // цвет текста
  bg: [string, string];
  fonts: Fonts;
}

export interface FrameInput {
  t: number; // секунды от начала сцены
  amp: number; // громкость музыки 0..1 (если есть анализатор)
}
