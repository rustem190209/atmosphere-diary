// POST /api/song-meta — ссылка на песню → название, исполнитель и адрес встроенного плеера.
// Запрос к oEmbed делаем с сервера: браузер не пускает такие запросы к чужим сайтам (CORS).
// Аудио не скачиваем — только описание и плеер сервиса.

type Meta = {
  title?: string;
  artist?: string;
  embedUrl?: string;
  service?: "youtube" | "spotify" | "other";
};

function youtubeId(u: URL): string | null {
  if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
  if (u.hostname.includes("youtube.com")) {
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/"))
      return u.pathname.split("/")[2] ?? null;
    return u.searchParams.get("v");
  }
  return null;
}

// «Исполнитель - Название» из заголовка YouTube-видео
function splitTitle(
  raw: string,
  author?: string,
): { title: string; artist?: string } {
  const clean = raw
    .replace(
      /\s*[\(\[](official|lyric|audio|video|music video|клип|official video)[^\)\]]*[\)\]]/gi,
      "",
    )
    .trim();
  const m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: clean, artist: author?.replace(/\s*-\s*Topic$/i, "") };
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let raw = "";
  try {
    raw = String((await request.json()).url ?? "").trim();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return Response.json({ error: "Это не похоже на ссылку" }, { status: 400 });
  }

  const meta: Meta = { service: "other" };

  const yt = youtubeId(u);
  if (yt) {
    meta.service = "youtube";
    meta.embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`;
    const data = await fetchJson(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(raw)}`,
    );
    if (data?.title)
      Object.assign(
        meta,
        splitTitle(String(data.title), data.author_name as string | undefined),
      );
  } else if (u.hostname.includes("spotify.com")) {
    meta.service = "spotify";
    // /track/ID или /intl-ru/track/ID
    const m = u.pathname.match(/\/(track|album|playlist)\/([A-Za-z0-9]+)/);
    if (m) meta.embedUrl = `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
    const data = await fetchJson(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(raw)}`,
    );
    if (data?.title) meta.title = String(data.title);
  }

  // Даже если сервис не ответил, возвращаем то, что есть: анализ всё равно оценит песню по полям формы
  return Response.json(meta);
}
