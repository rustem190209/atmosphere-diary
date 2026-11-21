// Экран «Новый день».
import DayForm from "@/components/DayForm";

export default function NewDayPage() {
  return (
    <section>
      <h1>Новый день</h1>
      <p className="muted lead">
        Расскажите, как прошёл день, приложите фото и песню — дневник превратит
        это в воспоминание.
      </p>
      <DayForm />
    </section>
  );
}
