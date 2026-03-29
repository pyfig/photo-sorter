import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCard } from "@/components/summary-card";
import { getJobDetails } from "@/lib/data";
import { formatDate, percent } from "@/lib/utils";

export default async function JobDetailsPage({
  params
}: {
  params: Promise<{ workspaceId: string; jobId: string }>;
}) {
  const { workspaceId, jobId } = await params;
  const job = await getJobDetails(workspaceId, jobId);

  if (!job) {
    notFound();
  }

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        eyebrow="Processing job"
        title={job.id}
        description="Статус, прогресс и журнал событий асинхронной обработки фото."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Status" value={<StatusBadge status={job.status} />} />
        <SummaryCard label="Progress" value={percent(job.progressPercent)} />
        <SummaryCard label="Started" value={formatDate(job.startedAt)} />
        <SummaryCard label="Finished" value={formatDate(job.finishedAt)} />
      </section>

      {job.errorMessage ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <h2>Error</h2>
          <p>{job.errorMessage}</p>
        </section>
      ) : null}

      <section className="grid">
        {job.events.length === 0 ? (
          <EmptyState
            title="Job events пока нет"
            description="События появятся, когда web layer или worker запишут их в `job_events`."
          />
        ) : (
          job.events.map((event) => (
            <article className="event-card" key={event.id}>
              <strong>{event.eventType}</strong>
              <p className="muted">{formatDate(event.createdAt)}</p>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </article>
          ))
        )}
      </section>
    </>
  );
}
