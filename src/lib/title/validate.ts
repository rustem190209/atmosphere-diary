// Проверка и чистка названий папок дня (раздел 8.9 ТЗ): 3–7 слов, без эмодзи и точки в конце.

const EMOJI_ALL = /[\p{Extended_Pictographic}\u{FE0F}]/gu; // для замены
const HAS_EMOJI = /\p{Extended_Pictographic}/u; // для проверки

export function countWords(title: string): number {
  return title.trim().split(/\s+/).filter(Boolean).length;
}

// Убрать эмодзи, кавычки, лишние пробелы и знаки в конце; первая буква заглавная
export function normalizeTitle(raw: string): string {
  let t = raw.replace(EMOJI_ALL, "").replace(/[«»"„“”']/g, "");
  t = t
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…,;:]+$/u, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function isValidTitle(title: string): boolean {
  if (HAS_EMOJI.test(title)) return false;
  if (/[.!?…]$/u.test(title.trim())) return false;
  const n = countWords(title);
  return n >= 3 && n <= 7;
}

// Выбрать первое годное название; если ни одно не подошло — собрать из ключевых слов
export function pickTitle(candidates: string[], keywords: string[]): string {
  for (const c of candidates) {
    const t = normalizeTitle(c);
    if (isValidTitle(t)) return t;
  }
  const [a = "тишина", b = "свет"] = keywords;
  return normalizeTitle(`День про ${a} и ${b}`);
}
