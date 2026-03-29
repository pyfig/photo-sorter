import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { getWorkspaceOverview } from "@/lib/data";

export default async function UploadsPage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await getWorkspaceOverview(workspaceId);

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        eyebrow="Uploads"
        title="Upload batches"
        description="Этот экран фиксирует cloud-first flow: сначала upload batch в Supabase Storage, затем создание processing job."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Workspace" value={workspace.name} />
        <SummaryCard label="Uploads" value={workspace.uploadCount} />
        <SummaryCard label="Photos" value={workspace.totalPhotos} />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>API contract</h2>
        <p className="muted">
          <code>POST /api/workspaces/[workspaceId]/uploads</code> создает upload
          batch. После этого клиент загружает файлы напрямую в bucket{" "}
          <code>raw-photos</code> по пути{" "}
          <code>{"{workspace_id}/{upload_id}/filename"}</code>, а затем вызывает{" "}
          <code>POST /api/workspaces/[workspaceId]/uploads/[uploadId]/photos</code>{" "}
          для записи метаданных файлов в таблицу <code>photos</code>.
        </p>
      </section>

      <section className="panel">
        <h2>Следующий шаг</h2>
        <p className="muted">
          После загрузки фронтенд создает processing job через{" "}
          <code>POST /api/workspaces/[workspaceId]/jobs</code>.
        </p>
      </section>
    </>
  );
}
