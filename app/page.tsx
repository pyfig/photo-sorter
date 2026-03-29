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
      description: `Внутри уже ${workspace.totalPhotos} фото. Можно сразу открыть workspace и запустить распознавание людей.`
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
    description: "Фотографии на месте. Можно запускать следующую обработку и смотреть статус."
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
        eyebrow="Панель"
        title="Откройте готовый набор или создайте свой workspace"
        description="После входа вам сразу доступен общий набор TechCommunity Fest с уже загруженными фотографиями. Отсюда же можно создать отдельный workspace под свою съёмку."
      />

      <section className="journey-grid" style={{ marginBottom: 24 }}>
        <article className="journey-card">
          <span className="journey-step">1</span>
          <h2>Откройте готовый набор</h2>
          <p>Общий workspace уже содержит предзагруженные фотографии и готов к запуску распознавания.</p>
        </article>
        <article className="journey-card">
          <span className="journey-step">2</span>
          <h2>Создайте свой workspace</h2>
          <p>Если нужен отдельный проект под свою съёмку, создайте его одной кнопкой прямо из dashboard.</p>
        </article>
        <article className="journey-card">
          <span className="journey-step">3</span>
          <h2>Откройте результат</h2>
          <p>Следите за прогрессом и открывайте готовые группы людей по мере завершения.</p>
        </article>
      </section>

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Проекты" value={workspaces.length} hint="Активные рабочие пространства" />
        <SummaryCard label="Фото" value={totals.photos} hint="Всего загружено во всех проектах" />
        <SummaryCard label="В работе" value={totals.activeJobs} hint="Обработки, которые ещё не завершились" />
        <SummaryCard label="Результаты" value={totals.clusters} hint="Готовые группы людей" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-intro">
          <h2>Что можно сделать сразу</h2>
          <p className="muted">
            Готовый demo-workspace уже доступен. Если нужно работать отдельно от общего набора,
            ниже можно создать новый workspace под конкретную съёмку.
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
            description="Создайте первый проект, чтобы загрузить съёмку, запустить обработку и открыть результат в одном месте."
          />
          <WorkspaceOnboardingForm />
        </section>
      ) : (
        <section className="grid">
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

      <section className="grid" id="create-workspace" style={{ marginTop: 24 }}>
        <WorkspaceOnboardingForm />
      </section>
    </>
  );
}
