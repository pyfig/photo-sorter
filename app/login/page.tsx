import { redirect } from "next/navigation";

import { ConfigurationState } from "@/components/configuration-state";
import { LoginForm } from "@/components/login-form";
import { PageHeader } from "@/components/page-header";
import { getWebEnvCheck, hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  if (!hasRequiredWebEnv()) {
    const check = getWebEnvCheck();

    return (
      <>
        <PageHeader
          eyebrow="Настройка"
          title="Вход пока недоступен"
          description="Чтобы входить по email и паролю, приложению нужен рабочий Supabase Auth."
        />
        <ConfigurationState
          description="Настройте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`, затем повторите вход."
          missingKeys={check.missing}
          title="Не хватает настроек для входа"
        />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="Вход"
        title="Войдите в свои проекты по email и паролю"
        description="Одна форма для входа и регистрации. После авторизации вы сможете открыть свои workspaces, загрузки и результаты в одном интерфейсе."
      />
      <section className="split-layout">
        <LoginForm message={params.message} nextPath={params.next} />
        <section className="panel">
          <div className="panel-intro">
            <h2>Что будет после входа</h2>
            <p className="muted">
              Интерфейс ведёт по шагам, поэтому отдельные инструкции не понадобятся даже при
              первом входе.
            </p>
          </div>
          <div className="check-list">
            <article className="check-card">
              <strong>Откройте общий набор</strong>
              <p>Сразу увидите, как выглядят загрузки, очереди и готовые результаты без пустого экрана.</p>
            </article>
            <article className="check-card">
              <strong>Создайте свой проект</strong>
              <p>Отдельно для клиента, события или внутреннего архива, чтобы не смешивать разные потоки.</p>
            </article>
            <article className="check-card">
              <strong>Загрузите фотографии и откройте результат</strong>
              <p>Сервис зарегистрирует файлы, поставит их в очередь и покажет понятный статус обработки.</p>
            </article>
          </div>
        </section>
      </section>
    </>
  );
}
