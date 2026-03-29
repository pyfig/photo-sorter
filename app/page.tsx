import { redirect } from "next/navigation";
import Link from "next/link";

import { ConfigurationState } from "@/components/configuration-state";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { WorkspaceOnboardingForm } from "@/components/workspace-onboarding-form";
import { getWebEnvCheck, hasRequiredWebEnv } from "@/lib/env";
import { listWorkspacesForUser } from "@/lib/data";
import { ensureSharedWorkspaceAccess } from "@/lib/shared-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkspaceSummary } from "@/lib/types";

function describeWorkspaceState(workspace: WorkspaceSummary) {
  if (workspace.isShared) {
    if (workspace.activeJobs > 0) {
      return {
        pill: "Демо обрабатывается",
        description: "В готовом наборе уже запущена обработка. Откройте workspace, чтобы следить за прогрессом."
      };
    }

    if (workspace.clustersCount > 0) {
      return {
        pill: "Демо с результатами",
        description: "Это общий предзагруженный набор. Фото уже лежат в проекте, а часть результатов распознавания уже готова."
      };
    }

    return {
      pill: "Готовый набор",
      description: `Внутри уже ${workspace.totalPhotos} фото. Можно сразу открыть workspace и посмотреть автоматический pipeline распознавания людей.`
    };
  }

  if (workspace.activeJobs > 0) {
    return {
      pill: "Идёт обработка",
      description: "Новые фотографии уже в работе. Откройте проект, чтобы следить за прогрессом."
    };
  }

  if (workspace.totalPhotos === 0) {
    return {
      pill: "Готов к первой загрузке",
      description: "Проект создан. Осталось добавить первую подборку фотографий."
    };
  }

  if (workspace.clustersCount > 0) {
    return {
      pill: "Результаты готовы",
      description: "В проекте уже есть найденные люди. Можно открыть результат или добавить новую съёмку."
    };
  }

  return {
    pill: "Фото загружены",
    description: "Фотографии на месте. Следующий pipeline стартует автоматически при новой загрузке, а статус уже можно открыть."
  };
}

export default async function HomePage() {
  if (!hasRequiredWebEnv()) {
    const check = getWebEnvCheck();

    return (
      <>
        <PageHeader
          eyebrow="Настройка"
          title="Сервис пока не готов к работе"
          description="Чтобы пользователи могли входить, загружать фотографии и видеть результаты, приложению нужны обязательные cloud-настройки."
        />
        <ConfigurationState
          description="Добавьте обязательные env в `.env.local` или в cloud runtime, затем перезапустите приложение."
          missingKeys={check.missing}
          title="Не хватает обязательных настроек"
        />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureSharedWorkspaceAccess();

  const workspaces = await listWorkspacesForUser();
  const sharedWorkspace = workspaces.find((workspace) => workspace.isShared) ?? null;
  const totals = workspaces.reduce(
    (accumulator, workspace) => ({
      photos: accumulator.photos + workspace.totalPhotos,
      activeJobs: accumulator.activeJobs + workspace.activeJobs,
      clusters: accumulator.clusters + workspace.clustersCount
    }),
    {
      photos: 0,
      activeJobs: 0,
      clusters: 0
    }
  );

  return (
    <>
      <PageHeader
        eyebrow="Проекты"
        title="Откройте готовый набор или создайте свой workspace"
        description="Photo Sorter собирает загрузки, очереди и результаты в одном интерфейсе. Общий workspace уже доступен после входа, а отдельный проект можно создать за минуту."
      />

      <section className="hero-band" style={{ marginBottom: 24 }}>
        <article className="panel panel-highlight">
          <div className="section-heading">
            <h2>Что доступно сразу</h2>
            <span className="muted">Готовый набор, отдельные проекты и понятный путь от загрузки к результату</span>
          </div>
          <div className="list-inline hero-ribbon">
            <span>Проектов: {workspaces.length}</span>
            <span>Фото: {totals.photos}</span>
            <span>Активных обработок: {totals.activeJobs}</span>
            <span>Готовых результатов: {totals.clusters}</span>
          </div>
          <p className="muted">
            Готовый набор помогает быстро увидеть весь рабочий цикл без пустого экрана, а
            отдельные workspaces позволяют разнести клиентские и внутренние съёмки по
            разным проектам.
          </p>
          <div className="actions">
            {sharedWorkspace ? (
              <Link className="button" href={`/workspaces/${sharedWorkspace.id}`}>
                Открыть общий workspace
              </Link>
            ) : null}
            <Link className="button-secondary" href="#create-workspace">
              Создать workspace
            </Link>
          </div>
        </article>

        <aside className="ecosystem-map" aria-label="Обзор возможностей">
          <article className="ecosystem-node ecosystem-node-primary">
            <strong>Готовый набор</strong>
            <p>Предзагруженные фотографии и быстрый старт без пустого состояния.</p>
          </article>
          <article className="ecosystem-node">
            <strong>Отдельный проект</strong>
            <p>Изолированная рабочая зона для клиента, события или архива.</p>
          </article>
          <article className="ecosystem-node ecosystem-node-soft">
            <strong>Результаты</strong>
            <p>Результаты появляются по мере завершения обработки и остаются под рукой.</p>
          </article>
        </aside>
      </section>

      <section className="journey-grid" style={{ marginBottom: 24 }}>
        <article className="journey-card">
          <span className="journey-step">1</span>
          <h2>Откройте готовый набор</h2>
          <p>Общий workspace уже содержит предзагруженные фотографии и помогает быстро проверить весь рабочий цикл.</p>
        </article>
        <article className="journey-card">
          <span className="journey-step">2</span>
          <h2>Создайте отдельный проект</h2>
          <p>Если нужен самостоятельный поток под клиента или событие, создайте свой workspace одной кнопкой прямо из dashboard.</p>
        </article>
        <article className="journey-card">
          <span className="journey-step">3</span>
          <h2>Откройте результат</h2>
          <p>Открывайте прогресс, журнал событий и готовые группы людей по мере завершения обработки.</p>
        </article>
      </section>

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Проекты" value={workspaces.length} hint="Рабочие пространства, в которых живут ваши съёмки" />
        <SummaryCard label="Фото" value={totals.photos} hint="Все кадры, уже сохранённые в системе" />
        <SummaryCard label="В работе" value={totals.activeJobs} hint="Очереди и запуски, которые ещё двигаются" />
        <SummaryCard label="Результаты" value={totals.clusters} hint="Готовые группы людей, доступные для просмотра" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-intro">
          <h2>С чего начать</h2>
          <p className="muted">
            Если нужно быстро проверить поток end-to-end, откройте общий workspace. Если
            нужен отдельный проект для клиента или внутренней съёмки, создайте его ниже.
          </p>
        </div>
        <div className="actions">
          {sharedWorkspace ? (
            <Link className="button" href={`/workspaces/${sharedWorkspace.id}`}>
              Открыть готовый workspace
            </Link>
          ) : null}
          <Link className="button-secondary" href="#create-workspace">
            Создать workspace
          </Link>
        </div>
      </section>

      {workspaces.length === 0 ? (
        <section className="grid">
          <EmptyState
            title="Пока нет ни одного проекта"
            description="Создайте первый проект, чтобы загрузить съёмку, автоматически запустить обработку и открыть результат в одном аккуратном контуре."
          />
          <WorkspaceOnboardingForm />
        </section>
      ) : (
        <section className="grid">
          <div className="section-heading">
            <h2>Ваши пространства обработки</h2>
            <span className="muted">Каждая карточка показывает текущий ритм проекта и следующий удобный шаг</span>
          </div>
          {workspaces.map((workspace) => {
            const state = describeWorkspaceState(workspace);

            return (
              <article className="workspace-card" key={workspace.id}>
                <div className="workspace-card-top">
                  <div>
                    <p className="workspace-pill">{state.pill}</p>
                    <h2>{workspace.name}</h2>
                    <p className="muted">{state.description}</p>
                  </div>
                  <span className="muted">/{workspace.slug}</span>
                </div>

                <div className="workspace-metrics">
                  <div className="workspace-metric">
                    <span>Фото</span>
                    <strong>{workspace.totalPhotos}</strong>
                  </div>
                  <div className="workspace-metric">
                    <span>В работе</span>
                    <strong>{workspace.activeJobs}</strong>
                  </div>
                  <div className="workspace-metric">
                    <span>Результаты</span>
                    <strong>{workspace.clustersCount}</strong>
                  </div>
                </div>

                <div className="actions">
                  <Link className="button" href={`/workspaces/${workspace.id}`}>
                    Открыть проект
                  </Link>
                  <Link className="button-secondary" href={`/workspaces/${workspace.id}/uploads`}>
                    Загрузить фото
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="split-layout" id="create-workspace" style={{ marginTop: 24 }}>
        <section className="panel panel-highlight">
          <div className="panel-intro">
            <h2>Новый проект</h2>
            <p className="muted">
              Отдельный workspace помогает не смешивать архивы, очереди и результаты между
              разными клиентами, событиями и внутренними съёмками.
            </p>
          </div>
          <div className="check-list">
            <article className="check-card">
              <strong>Изоляция данных</strong>
              <p>Свои загрузки, свои обработки и свои результаты в пределах одного проекта.</p>
            </article>
            <article className="check-card">
              <strong>Чёткий адрес</strong>
              <p>Понятный slug помогает быстро ориентироваться и делиться ссылками внутри команды.</p>
            </article>
            <article className="check-card">
              <strong>Простой старт</strong>
              <p>Создание проекта не требует админ-подготовки и не ломает общий демонстрационный набор.</p>
            </article>
          </div>
        </section>
        <WorkspaceOnboardingForm />
      </section>
    </>
  );
}
