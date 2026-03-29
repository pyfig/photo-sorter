import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { StatusBadge } from "@/components/status-badge";
import { UploadFlow } from "@/components/UploadFlow";
import { UploadJobLauncher } from "@/components/upload-job-launcher";
import { getWorkspaceOverview, listUploadsForWorkspace } from "@/lib/data";
import type { UploadSummary } from "@/lib/types";
import { formatDate, shortId } from "@/lib/utils";

function getUploadStatusLabel(upload: UploadSummary) {
  if (upload.status === "failed") {
    return "Во время загрузки что-то пошло не так. Проверьте статус и повторите попытку.";
  }

  if (upload.jobStatus === "running" && upload.jobPhase === "finalizing") {
    return "Загрузка уже закрыта. Worker завершает финальную кластеризацию по всей подборке.";
  }

  if (upload.jobStatus === "running") {
    return "Файлы уже поступают в preprocessing. Обработка идёт параллельно с загрузкой.";
  }

  if (upload.jobStatus === "completed") {
    return "Загрузка закрыта, а итоговая обработка уже завершена.";
  }

  if (upload.status === "uploaded") {
    return "Файлы загружены и upload batch закрыт. Если job ещё не создан, можно запустить повторный run вручную.";
  }

  return "Фотографии ещё передаются и регистрируются в проекте.";
}

function getUploadBadgeStatus(upload: UploadSummary): "running" | "completed" | "failed" {
  if (upload.jobStatus === "completed") {
    return "completed";
  }

  if (upload.status === "failed" || upload.jobStatus === "failed") {
    return "failed";
  }

  if (upload.status === "uploaded" && !upload.jobStatus) {
    return "completed";
  }

  return "running";
}

export default async function UploadsPage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await getWorkspaceOverview(workspaceId);
  const uploads = await listUploadsForWorkspace(workspaceId);

  if (!workspace) {
    notFound();
  }

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        backLabel="К проекту"
        eyebrow="Загрузка фото"
        title="Добавьте новую подборку"
        description={
          workspace.isShared
            ? "В этом workspace уже есть предзагруженный upload batch. Можно сразу посмотреть автоматическую обработку или добавить свою новую подборку."
            : "Здесь начинается путь фотографии: загрузка, мгновенная регистрация в проекте, постановка в preprocessing и переход к статусу обработки."
        }
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Проект" value={workspace.name} hint="Контур, в котором живёт текущая подборка" />
        <SummaryCard label="Загрузки" value={workspace.uploadCount} hint="Сколько партий уже прошло через этот проект" />
        <SummaryCard label="Фото в проекте" value={workspace.totalPhotos} hint="Все кадры, уже зарегистрированные в системе" />
        <SummaryCard label="Найдено людей" value={workspace.peopleCount} hint="Готовые результаты из завершённых запусков" />
      </section>

      <div className="grid" style={{ marginBottom: 24 }}>
        <UploadFlow workspaceId={workspaceId} />
      </div>

      <section className="panel">
        <div className="section-heading">
          <h2>Последние загрузки</h2>
          <span className="muted">Что уже передано в проект и в каком оно состоянии</span>
        </div>
        {uploads.length === 0 ? (
          <EmptyState
            title="Загрузок пока нет"
            description="Создайте первую загрузку выше. Как только фотографии будут зарегистрированы, запись появится в этом списке."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Загрузка</th>
                  <th>Статус</th>
                  <th>Создана</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id}>
                    <td>
                      <div>
                        <strong>{upload.name}</strong>
                        <p className="muted">Загрузка #{shortId(upload.id)}</p>
                      </div>
                    </td>
                    <td>
                      <div className="grid" style={{ gap: 8 }}>
                        <StatusBadge
                          status={getUploadBadgeStatus(upload)}
                        />
                        <span className="muted">{getUploadStatusLabel(upload)}</span>
                        {upload.jobId ? (
                          <span className="muted">
                            Job #{shortId(upload.jobId)}: {upload.processedPhotos} из{" "}
                            {upload.totalPhotos || upload.registeredPhotos} фото, прогресс{" "}
                            {upload.progressPercent ?? 0}%.
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatDate(upload.createdAt)}</td>
                    <td>
                      {upload.jobId ? (
                        <Link
                          className="button-secondary"
                          href={`/workspaces/${workspaceId}/jobs/${upload.jobId}`}
                        >
                          Открыть статус
                        </Link>
                      ) : upload.status === "uploaded" ? (
                        <UploadJobLauncher uploadId={upload.id} workspaceId={workspaceId} />
                      ) : (
                        <span className="muted">Дождитесь завершения загрузки</span>
                      )}
                    </td>
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
