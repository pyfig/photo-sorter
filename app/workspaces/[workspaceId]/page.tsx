import Link from "next/link";

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

      <section className="panel">
        <h2>Recent jobs</h2>
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
      </section>
    </>
  );
}

