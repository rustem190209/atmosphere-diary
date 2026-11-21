// Проверка запасного анализа: 10 разных текстов → валидный MoodSpec и название 3–7 слов.
// Запуск (PowerShell): npm run check:analyze
import { MoodSpecSchema } from "../src/lib/schema";
import { analyzeTextFallback } from "../src/lib/analyze/fallback";
import { isValidTitle } from "../src/lib/title/validate";

const TEXTS = [
  "Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали с другом.",
  "Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка. Дедлайн в 9 утра, нервы на пределе, кофе уже не помогает.",
  "Весь вечер дома один. За окном дождь, пил чай и было немного грустно и пусто.",
  "Разбирали с бабушкой старые фото, она вспоминала своё детство, а я просто слушал и обнимал её. Так нежно и тепло.",
  "Сдал экзамен! Страшно было ужасно, нервничал всё утро, но в итоге получилось, я так горд собой.",
  "Выходной с друзьями на пляже, купались, смеялись, танцевали под гитару до заката. Счастье!",
  "Праздничный ужин с семьёй, торт, огни, все рядом. Очень благодарна за этот вечер.",
  "Проснулся рано, пошёл в лес. Тишина, снег скрипит под ногами, мороз. Спокойно и красиво.",
  "Устал. Весь день в университете, пары, потом библиотека. Сил нет.",
  "Ничего особенного, обычный день.",
];

let ok = 0;
for (const text of TEXTS) {
  const t0 = performance.now();
  const mood = analyzeTextFallback({ text });
  const ms = (performance.now() - t0).toFixed(1);
  const valid = MoodSpecSchema.safeParse(mood);
  const titleOk = isValidTitle(mood.title);
  if (valid.success && titleOk) ok++;
  console.log(
    `${valid.success && titleOk ? "OK  " : "FAIL"} «${mood.title}» | ${mood.emotions.map((e) => `${e.emotion}:${e.weight}`).join(", ")}` +
      ` | V${mood.valence} E${mood.energy} T${mood.tension} W${mood.warmth} | ${mood.timeOfDay}/${mood.season} | ${mood.atmosphere} | ${ms}мс`,
  );
  if (!valid.success) console.log(valid.error.issues);
}
console.log(`\nИтого: ${ok}/${TEXTS.length}`);
process.exit(ok === TEXTS.length ? 0 : 1);
