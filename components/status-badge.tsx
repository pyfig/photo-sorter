import type { JobStatus } from "@/lib/types";

const labels: Record<JobStatus, string> = {
  queued: "В очереди",
  running: "В работе",
  completed: "Готово",
  failed: "Ошибка",
  cancelled: "Остановлено"
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
