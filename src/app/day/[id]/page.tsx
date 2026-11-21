// Экран «Воспоминание». Дни хранятся в браузере, поэтому всё содержимое — клиентский компонент.
// Suspense нужен Next.js 16: адрес страницы известен только во время запроса.
import { Suspense } from "react";
import DayView from "@/components/DayView";

export default function DayPage() {
  return (
    <Suspense fallback={<p className="muted">Открываю день…</p>}>
      <DayView />
    </Suspense>
  );
}
