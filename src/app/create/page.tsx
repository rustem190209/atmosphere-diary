// Экран «Создать воспоминание».
import DayForm from "@/components/DayForm";

export default function CreatePage() {
  return (
    <section>
      <div className="create-head">
        <span className="eyebrow">Новое воспоминание</span>
        <h1>Расскажите о своём дне</h1>
        <p>Текст, фотографии, песня и пара чувств — из этого получится короткий фильм о том, как ощущался день.</p>
      </div>
      <DayForm />
    </section>
  );
}
