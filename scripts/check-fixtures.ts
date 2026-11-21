// Проверка: все фикстуры MoodSpec проходят zod-схему.
// Запуск (PowerShell): npm run check:fixtures
import { MoodSpecSchema } from "../src/lib/schema.ts";
import { MOOD_FIXTURES } from "../src/lib/fixtures/moods.ts";

let failed = 0;
for (const [name, mood] of Object.entries(MOOD_FIXTURES)) {
  const r = MoodSpecSchema.safeParse(mood);
  if (r.success) console.log(`OK   ${name}: «${mood.title}»`);
  else {
    failed++;
    console.log(`FAIL ${name}:`, r.error.issues);
  }
}
process.exit(failed ? 1 : 0);
