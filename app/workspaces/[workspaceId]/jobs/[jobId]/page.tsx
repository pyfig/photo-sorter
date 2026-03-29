import { notFound } from "next/navigation";

import { JobDetailsLive } from "@/components/job-details-live";
import { PageHeader } from "@/components/page-header";
import { getJobDetails } from "@/lib/data";
import { getJobCopy } from "@/lib/job-presentation";
import { getRuntimeHealthSnapshot } from "@/lib/runtime-health";

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

  const copy = getJobCopy(job);
  const runtimeHealth =
    job.status === "queued" || job.status === "running"
      ? await getRuntimeHealthSnapshot()
      : null;

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        backLabel="К проекту"
        eyebrow="Статус обработки"
        title={copy.title}
        description={copy.description}
      />
      <JobDetailsLive
        initialJob={job}
        initialRuntimeHealth={runtimeHealth}
        workspaceId={workspaceId}
      />
    </>
  );
}
