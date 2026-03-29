import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { WorkspaceLiveOverview } from "@/components/workspace-live-overview";
import { getWorkspaceOverview } from "@/lib/data";

export default async function WorkspacePage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await getWorkspaceOverview(workspaceId);

  if (!workspace) {
    notFound();
  }

  return (
    <>
      <PageHeader
        backHref="/"
        backLabel="Ко всем проектам"
        eyebrow={workspace.isShared ? "Общий workspace" : "Проект"}
        title={workspace.name}
        description={
          workspace.isShared
            ? "В этом workspace уже лежит предзагруженный набор фотографий. Откройте загрузки, чтобы сразу посмотреть автоматический pipeline на готовом датасете или добавить новую съёмку."
            : "Здесь видно, сколько фотографий уже загружено, какие результаты готовы и куда двигаться дальше по этому проекту."
        }
      />

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-intro">
          <h2>Куда двигаться дальше</h2>
          <p className="muted">
            {workspace.isShared
              ? "В предзагруженном наборе можно сразу открыть загрузки и посмотреть, как обработка стартует автоматически по уже сохранённым фотографиям."
              : "Добавьте новую съёмку или откройте последнюю обработку, чтобы посмотреть прогресс и результат."}
          </p>
        </div>
        <div className="actions">
          <Link className="button" href={`/workspaces/${workspace.id}/uploads`}>
            {workspace.isShared ? "Открыть загрузки и pipeline" : "Загрузить фото"}
          </Link>
          {workspace.recentJobs[0] ? (
            <Link
              className="button-secondary"
              href={`/workspaces/${workspace.id}/jobs/${workspace.recentJobs[0].id}`}
            >
              Открыть последнюю обработку
            </Link>
          ) : null}
        </div>
      </section>

      <WorkspaceLiveOverview initialWorkspace={workspace} />
    </>
  );
}
