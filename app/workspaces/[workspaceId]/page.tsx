import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCard } from "@/components/summary-card";
import { getWorkspaceOverview } from "@/lib/data";
import { formatDate, percent, shortId } from "@/lib/utils";

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
            ? "В этом workspace уже лежит предзагруженный набор фотографий. Откройте загрузки, чтобы запустить обработку на готовом датасете или добавить новую съёмку."
            : "Здесь видно, сколько фотографий уже загружено, какие результаты готовы и куда двигаться дальше по этому проекту."
        }
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Фото" value={workspace.totalPhotos} hint="Кадры, уже живущие в этом пространстве" />
        <SummaryCard label="Люди" value={workspace.peopleCount} hint="Готовые группы после завершённых запусков" />
        <SummaryCard label="Загрузки" value={workspace.uploadCount} hint="Все партии, зарегистрированные в проекте" />
        <SummaryCard label="Адрес проекта" value={`/${workspace.slug}`} hint="Постоянный путь для навигации внутри системы" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-intro">
          <h2>Куда двигаться дальше</h2>
          <p className="muted">
            {workspace.isShared
              ? "В предзагруженном наборе можно сразу открыть загрузки и запустить обработку по уже сохранённым фотографиям."
              : "Добавьте новую съёмку или откройте последнюю обработку, чтобы посмотреть прогресс и результат."}
          </p>
        </div>
        <div className="actions">
          <Link className="button" href={`/workspaces/${workspace.id}/uploads`}>
            {workspace.isShared ? "Открыть загрузки и запустить обработку" : "Загрузить фото"}
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

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="section-heading">
          <h2>Последние результаты</h2>
          <span className="muted">Готовые группы людей, которые уже можно открыть и проверить</span>
        </div>

        {workspace.recentClusters.length === 0 ? (
          <EmptyState
            title="Результатов пока нет"
            description="Загрузите фотографии и дождитесь завершения обработки. Как только сервис найдёт группы людей, они появятся здесь."
          />
        ) : (
          <section className="cluster-grid">
            {workspace.recentClusters.map((cluster) => (
              <Link
                className="cluster-card"
                href={`/workspaces/${workspace.id}/people/${cluster.id}`}
                key={cluster.id}
              >
                <div className="cluster-preview">
                  {cluster.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={cluster.displayName} src={cluster.previewUrl} />
                  ) : (
                    <span>Превью появится после обработки</span>
                  )}
                </div>
                <div>
                  <strong>{cluster.displayName}</strong>
                  <p className="muted">{cluster.photoCount} фото</p>
                  <p className="muted">{formatDate(cluster.createdAt)}</p>
                </div>
              </Link>
            ))}
          </section>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Последние обработки</h2>
          <span className="muted">Статус, прогресс и время завершения по недавним запускам</span>
        </div>
        {workspace.recentJobs.length === 0 ? (
          <EmptyState
            title="Обработок пока нет"
            description="Перейдите к загрузке фотографий и запустите первую обработку для этого проекта."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Обработка</th>
                  <th>Статус</th>
                  <th>Прогресс</th>
                  <th>Создана</th>
                  <th>Завершена</th>
                </tr>
              </thead>
              <tbody>
                {workspace.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/workspaces/${workspace.id}/jobs/${job.id}`}>
                        Обработка #{shortId(job.id)}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td>{percent(job.progressPercent)}</td>
                    <td>{formatDate(job.createdAt)}</td>
                    <td>{formatDate(job.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
