import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCard } from "@/components/summary-card";
import { getJobDetails } from "@/lib/data";
import { getRuntimeHealthSnapshot } from "@/lib/runtime-health";
import type { JobDetails, JobEvent } from "@/lib/types";
import { formatDate, percent, shortId } from "@/lib/utils";

function formatPayloadValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return "есть дополнительные данные";
}

function formatMetric(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return "0";
}

function formatSeconds(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value} сек.`;
}

function getJobCopy(job: JobDetails) {
  switch (job.status) {
    case "queued":
      return {
        title: "Обработка запланирована",
        description: `Фотографии уже приняты. Обработка #${shortId(job.id)} ждёт своей очереди и скоро начнётся.`,
        summary: "Сервис поставил задачу в очередь. Следующий шаг: начнётся разбор фотографий."
      };
    case "running":
      return {
        title: "Идёт обработка фотографий",
        description: `Сервис анализирует снимки, ищет лица и собирает группы людей для обработки #${shortId(job.id)}.`,
        summary: "Сейчас сервис читает фотографии, находит лица и объединяет похожие кадры."
      };
    case "completed":
      return {
        title: "Результат готов",
        description: `Обработка #${shortId(job.id)} завершена. Можно вернуться в проект и открыть найденные результаты.`,
        summary: "Все шаги завершены. Теперь в проекте доступны готовые группы людей."
      };
    case "failed":
      return {
        title: "Обработка завершилась с ошибкой",
        description: `Обработка #${shortId(job.id)} остановилась раньше времени. Ниже видно, на каком шаге это произошло.`,
        summary: "Нужна проверка ошибки и повторный запуск загрузки или обработки."
      };
    default:
      return {
        title: "Обработка остановлена",
        description: `Обработка #${shortId(job.id)} была остановлена до завершения.`,
        summary: "Автоматическое движение дальше не происходит. Если нужно, запустите новую обработку."
      };
  }
}

function describeJobEvent(event: JobEvent) {
  switch (event.eventType) {
    case "job_created":
      return {
        title: "Обработка создана",
        description: "Сервис принял новую загрузку и поставил её в очередь.",
        details:
          typeof event.payload.upload_id === "string"
            ? `Связана с загрузкой #${shortId(event.payload.upload_id)}.`
            : null
      };
    case "job_started":
      return {
        title: "Обработка началась",
        description: `В работу взято ${formatMetric(event.payload.photo_count)} фото.`,
        details: null
      };
    case "faces_detected":
      return {
        title: "Лица найдены",
        description: `Сервис обнаружил ${formatMetric(event.payload.detected_faces)} лиц на загруженных фотографиях.`,
        details: null
      };
    case "faces_clustered":
      return {
        title: "Фотографии сгруппированы",
        description: `Подготовлено ${formatMetric(event.payload.clustered_faces)} распознанных лиц для группировки.`,
        details:
          event.payload.detected_faces !== undefined
            ? `Всего найдено лиц: ${formatMetric(event.payload.detected_faces)}.`
            : null
      };
    case "job_completed":
      return {
        title: "Обработка завершена",
        description: `Готово ${formatMetric(event.payload.clusters)} групп людей.`,
        details: null
      };
    case "job_finished_without_faces":
      return {
        title: "Лица не обнаружены",
        description: "Обработка завершилась без найденных лиц.",
        details:
          event.payload.photo_count !== undefined
            ? `Проверено фотографий: ${formatMetric(event.payload.photo_count)}.`
            : null
      };
    case "photo_failed":
      return {
        title: "Одно фото не удалось обработать",
        description: "Сервис пропустил проблемный файл и продолжил работу с остальными.",
        details:
          typeof event.payload.storage_path === "string"
            ? `Файл: ${event.payload.storage_path}.`
            : null
      };
    case "job_failed":
      return {
        title: "Обработка остановилась с ошибкой",
        description:
          typeof event.payload.message === "string"
            ? event.payload.message
            : "Во время обработки произошла ошибка.",
        details: null
      };
    default: {
      const payloadSummary = Object.entries(event.payload)
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${formatPayloadValue(value)}`)
        .join(" • ");

      return {
        title: event.eventType,
        description: payloadSummary || "Сервис записал дополнительное техническое событие.",
        details: null
      };
    }
  }
}

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
  const runtimeHealth = job.status === "queued" ? await getRuntimeHealthSnapshot() : null;
  const workerRuntime = runtimeHealth?.checks.workerRuntime ?? null;
  const queueCheck = runtimeHealth?.checks.queue ?? null;

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        backLabel="К проекту"
        eyebrow="Статус обработки"
        title={copy.title}
        description={copy.description}
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Статус" value={<StatusBadge status={job.status} />} hint="Текущее состояние этой задачи" />
        <SummaryCard label="Прогресс" value={percent(job.progressPercent)} hint="Насколько далеко продвинулся текущий запуск" />
        <SummaryCard label="Старт" value={formatDate(job.startedAt)} hint="Когда worker взял задачу в работу" />
        <SummaryCard label="Завершение" value={formatDate(job.finishedAt)} hint="Когда обработка закончилась или остановилась" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-intro">
          <h2>Что происходит сейчас</h2>
          <p className="muted">{copy.summary}</p>
        </div>
        <div aria-hidden="true" className="progress-meter">
          <span style={{ width: percent(job.progressPercent) }} />
        </div>
        <div className="list-inline">
          <span>Обработка #{shortId(job.id)}</span>
          {job.uploadId ? <span>Загрузка #{shortId(job.uploadId)}</span> : null}
          <span>Прогресс: {percent(job.progressPercent)}</span>
        </div>
      </section>

      {job.status === "queued" ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-intro">
            <h2>Если обработка долго не начинается</h2>
            <p className="muted">
              Ниже показано реальное состояние worker runtime и очереди. Это помогает
              отличить обычное ожидание от ситуации, когда consumer очереди не жив.
            </p>
          </div>
          <p className={`notice ${workerRuntime?.status === "ok" ? "info" : "error"}`}>
            {workerRuntime?.status === "ok"
              ? `Worker ${workerRuntime.workerId ?? "unknown"} на связи. Последний heartbeat был ${formatSeconds(workerRuntime.lastSeenAgeSeconds)} назад.`
              : workerRuntime?.error ?? "Worker runtime недоступен."}
          </p>
          <div className="list-inline" style={{ marginBottom: 16 }}>
            <span>Queued jobs: {queueCheck?.queuedJobs ?? 0}</span>
            <span>Running jobs: {queueCheck?.runningJobs ?? 0}</span>
            {queueCheck?.oldestQueuedAt ? (
              <span>Самая старая queued job: {formatDate(queueCheck.oldestQueuedAt)}</span>
            ) : null}
            {workerRuntime?.lastSeenAt ? (
              <span>Последний heartbeat: {formatDate(workerRuntime.lastSeenAt)}</span>
            ) : null}
          </div>
          {workerRuntime?.lastError ? (
            <p className="notice error" style={{ marginBottom: 16 }}>
              Последняя ошибка worker: {workerRuntime.lastError}
            </p>
          ) : null}
          <div className="check-list">
            <article className="check-card">
              <strong>Проверьте `/api/health`</strong>
              <p>
                В health должен быть `workerRuntime.status = ok`. Если heartbeat stale или
                отсутствует, задача может висеть в `queued` бесконечно.
              </p>
            </article>
            <article className="check-card">
              <strong>Проверьте worker runtime</strong>
              <p>
                У worker должны быть `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`, иначе он
                не сможет стартовать, забрать jobs из очереди и писать heartbeat.
              </p>
            </article>
            <article className="check-card">
              <strong>Проверьте логи worker</strong>
              <p>
                На старте должны появляться сообщения о запуске worker, heartbeat и
                дальнейшем переходе job в `running`.
              </p>
            </article>
          </div>
        </section>
      ) : null}

      {job.errorMessage ? (
        <section className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-intro">
            <h2>Что пошло не так</h2>
            <p className="muted">
              Обработка остановилась раньше времени. Сообщение ниже поможет понять, нужен ли повторный запуск.
            </p>
          </div>
          <p className="notice error">{job.errorMessage}</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <h2>История обработки</h2>
          <span className="muted">Последние события по этой задаче в понятном порядке</span>
        </div>
        {job.events.length === 0 ? (
          <EmptyState
            title="История пока пуста"
            description="События появятся, как только сервис начнёт обновлять статус этой обработки."
          />
        ) : (
          <div className="timeline">
            {job.events.map((event) => {
              const view = describeJobEvent(event);

              return (
                <article className="timeline-item" key={event.id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div className="timeline-copy">
                    <div className="timeline-title-row">
                      <strong>{view.title}</strong>
                      <span className="muted">{formatDate(event.createdAt)}</span>
                    </div>
                    <p>{view.description}</p>
                    {view.details ? <p className="muted">{view.details}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
