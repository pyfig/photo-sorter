import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { StatusBadge } from "@/components/status-badge";
import { UploadFlow } from "@/components/upload-flow";
import { getWorkspaceOverview, listUploadsForWorkspace } from "@/lib/data";
import { formatDate } from "@/lib/utils";

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
        eyebrow="Uploads"
        title="Upload batches"
        description="Создайте upload batch, загрузите фото в Supabase Storage и сразу поставьте processing job в очередь."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Workspace" value={workspace.name} />
        <SummaryCard label="Uploads" value={workspace.uploadCount} />
        <SummaryCard label="Photos" value={workspace.totalPhotos} />
      </section>

      <div className="grid" style={{ marginBottom: 24 }}>
        <UploadFlow workspaceId={workspaceId} />
      </div>

      <section className="panel">
        <h2>Recent uploads</h2>
        {uploads.length === 0 ? (
          <EmptyState
            title="Uploads пока нет"
            description="Создайте первый upload batch выше. После успешной регистрации файлов он появится в этом списке."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Upload</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>
                    <div>
                      <strong>{upload.name}</strong>
                      <p className="muted">{upload.id}</p>
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      status={
                        upload.status === "uploaded"
                          ? "completed"
                          : upload.status === "failed"
                            ? "failed"
                            : "running"
                      }
                    />
                  </td>
                  <td>{formatDate(upload.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
