// Экспорт папки дня в ZIP (раздел 8.14 ТЗ) без сторонних библиотек.
// Формат ZIP «без сжатия» (store): фото и постер уже сжаты, так что размер почти тот же.
import type { DayRecord } from "../schema";
import { EMOTION_LABELS } from "../schema";

// Таблица для контрольной суммы CRC-32 (её требует формат ZIP)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entry = { name: string; data: Uint8Array };

export function makeZip(entries: Entry[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    // Локальный заголовок файла
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // имена в UTF-8 (кириллица)
    h.setUint32(14, crc, true);
    h.setUint32(18, e.data.length, true);
    h.setUint32(22, e.data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, e.data);
    // Запись в оглавлении архива
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, e.data.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const centralSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob(
    [...parts, ...central, new Uint8Array(end.buffer)].map(
      (p) => p.slice().buffer,
    ),
    { type: "application/zip" },
  );
}

const text = (s: string) => new TextEncoder().encode(s);
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

// Текст «Почему так выглядит» в Markdown
function whyMarkdown(day: DayRecord): string {
  const { style, mood } = day;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const lines = [
    `# ${day.title}`,
    "",
    `Настроение: ${mood.emotions.map((e) => `${EMOTION_LABELS[e.emotion]} ${pct(e.weight)}`).join(", ")} · ${mood.atmosphere}`,
    `Техники: живопись ${pct(style.weights.paint)}, геометрия ${pct(style.weights.geometry)}, плёнка ${pct(style.weights.film)}`,
    `Палитра: ${style.palette.join(" ")}`,
    "",
    "## Почему так выглядит",
    ...style.reasons.map((r) => `- **${r.signal}** → ${r.effect}. ${r.why}.`),
    "",
    ...(mood.fusionNotes.length
      ? [
          "## Как сложились сигналы",
          ...mood.fusionNotes.map((n) => `- ${n}`),
          "",
        ]
      : []),
    "_Это интерпретация настроения, а не диагноз._",
  ];
  return lines.join("\n");
}

export async function exportDayZip(
  day: DayRecord,
): Promise<{ blob: Blob; filename: string }> {
  const a = day.audio;
  const date = new Date(day.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const entries: Entry[] = [
    {
      name: "text.txt",
      data: text(`${day.title}\n${date}\n\n${day.input.text}\n`),
    },
    {
      name: "song.txt",
      data: text(
        [
          `Песня: ${[a.artist, a.title].filter(Boolean).join(" — ") || "без названия"}`,
          a.year ? `Год: ${a.year}` : "",
          a.genre ? `Жанр: ${a.genre}` : "",
          `Темп: ${a.bpm} BPM${a.estimated ? " (оценочно)" : ""}`,
          day.input.songUrl
            ? `Ссылка: ${day.input.songUrl}`
            : "Аудиофайл хранится только в браузере и в архив не входит (авторские права).",
        ]
          .filter(Boolean)
          .join("\n") + "\n",
      ),
    },
    { name: "why.md", data: text(whyMarkdown(day)) },
  ];
  for (const [k, p] of day.input.photos.entries())
    entries.push({ name: `photos/${k + 1}.jpg`, data: await bytes(p) });
  if (day.poster)
    entries.push({ name: "poster.jpg", data: await bytes(day.poster) });

  const safe = day.title.replace(/[\\/:*?"<>|]/g, "").trim() || "день";
  return {
    blob: makeZip(entries),
    filename: `${new Date(day.createdAt).toLocaleDateString("sv-SE")} ${safe}.zip`,
  };
}
