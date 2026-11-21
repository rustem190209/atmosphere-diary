// POST /api/analyze — текст дня → MoodSpec.
// Сейчас ключа ИИ нет, поэтому работает словарный анализ (source: "fallback").
// Когда появится ключ: добавить вызов LLM здесь, при ошибке оставить этот же фоллбек.
import { analyzeTextFallback } from "@/lib/analyze/fallback";
import { MoodSpecSchema } from "@/lib/schema";

const MAX_TEXT = 8000; // лимит размера входа
const LIMIT_PER_MIN = 30; // простая защита от злоупотреблений: запросов в минуту с одного IP
const hits = new Map<string, { count: number; since: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > 60_000) {
    hits.set(ip, { count: 1, since: now });
    return false;
  }
  h.count++;
  return h.count > LIMIT_PER_MIN;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip))
    return Response.json(
      { error: "Слишком много запросов, подождите минуту" },
      { status: 429 },
    );

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 20)
    return Response.json(
      { error: "Текст должен быть не короче 20 символов" },
      { status: 400 },
    );
  if (text.length > MAX_TEXT)
    return Response.json({ error: "Текст слишком длинный" }, { status: 413 });

  const mood = MoodSpecSchema.parse(analyzeTextFallback({ text }));
  return Response.json(mood);
}
