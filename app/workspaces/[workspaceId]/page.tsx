import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCard } from "@/components/summary-card";
import { getWorkspaceOverview } from "@/lib/data";
import { formatDate, percent } from "@/lib/utils";

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
        eyebrow="Workspace"
        title={workspace.name}
        description="Сводка по загруженным фотографиям, недавним jobs и переходам в upload/job/person flows."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Photos" value={workspace.totalPhotos} />
        <SummaryCard label="People" value={workspace.peopleCount} />
        <SummaryCard label="Uploads" value={workspace.uploadCount} />
        <SummaryCard label="Slug" value={workspace.slug} />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="actions">
          <Link className="button" href={`/workspaces/${workspace.id}/uploads`}>
            Manage uploads
          </Link>
          {workspace.recentJobs[0] ? (
            <Link
              className="button-secondary"
              href={`/workspaces/${workspace.id}/jobs/${workspace.recentJobs[0].id}`}
            >
              Open latest job
            </Link>
          ) : null}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="section-heading">
          <h2>Recent clusters</h2>
          <span className="muted">Последние найденные люди в этом workspace</span>
        </div>

        {workspace.recentClusters.length === 0 ? (
          <EmptyState
            title="Кластеров пока нет"
            description="Сначала загрузите фотографии и дождитесь завершения processing job."
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
                    <span>Preview pending</span>
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
        <h2>Recent jobs</h2>
        {workspace.recentJobs.length === 0 ? (
          <EmptyState
            title="Jobs пока нет"
            description="Создайте upload batch на странице uploads и запустите первую обработку."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
                <th>Finished</th>
              </tr>
            </thead>
            <tbody>
              {workspace.recentJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link href={`/workspaces/${workspace.id}/jobs/${job.id}`}>{job.id}</Link>
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
        )}
      </section>
    </>
  );
}
