import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { StatusBadge } from "@/components/status-badge";
import { UploadJobLauncher } from "@/components/upload-job-launcher";
import { UploadFlow } from "@/components/upload-flow";
import { getWorkspaceOverview, listUploadsForWorkspace } from "@/lib/data";
import { formatDate, shortId } from "@/lib/utils";

function getUploadStatusLabel(status: "uploading" | "uploaded" | "failed") {
  switch (status) {
    case "uploaded":
      return "Фотографии уже сохранены и готовы к обработке.";
    case "failed":
      return "Во время загрузки что-то пошло не так. Проверьте статус и повторите попытку.";
    default:
      return "Фотографии ещё передаются и регистрируются в проекте.";
  }
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
            ? "В этом workspace уже есть предзагруженный upload batch. Можно сразу запустить обработку или добавить свою новую подборку."
            : "Здесь начинается путь фотографии: загрузка, постановка в очередь и переход к статусу обработки."
        }
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Проект" value={workspace.name} />
        <SummaryCard label="Загрузки" value={workspace.uploadCount} />
        <SummaryCard label="Фото в проекте" value={workspace.totalPhotos} />
        <SummaryCard label="Найдено людей" value={workspace.peopleCount} />
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
                          status={
                            upload.status === "uploaded"
                              ? "completed"
                              : upload.status === "failed"
                                ? "failed"
                                : "running"
                          }
                        />
                        <span className="muted">{getUploadStatusLabel(upload.status)}</span>
                      </div>
                    </td>
                    <td>{formatDate(upload.createdAt)}</td>
                    <td>
                      {upload.status === "uploaded" ? (
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
