import { PageHeader } from "@/components/page-header";

export default function LoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Auth"
        title="Login"
        description="Страница-заготовка под Supabase Auth. На следующем этапе сюда добавляются email magic link и OAuth providers."
      />
      <section className="panel">
        <p className="muted">
          Для production рекомендуется использовать Supabase Auth c email magic link
          или GitHub/Google OAuth. В текущем bootstrap эта страница фиксирует
          маршрут и продуктовую точку входа.
        </p>
      </section>
    </>
  );
}

