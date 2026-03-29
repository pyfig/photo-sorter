"use client";

import { useEffect, useRef, useState } from "react";

import { describeJobEvent, formatSeconds, getJobCopy } from "@/lib/job-presentation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RuntimeHealthSnapshot } from "@/lib/runtime-health";
import type { JobDetails, JobEvent } from "@/lib/types";
import { formatDate, percent, shortId } from "@/lib/utils";

interface JobDetailsLiveProps {
  workspaceId: string;
  initialJob: JobDetails;
  initialRuntimeHealth: RuntimeHealthSnapshot | null;
}

interface JobSnapshotResponse {
  job: JobDetails;
  runtimeHealth: RuntimeHealthSnapshot | null;
}

const terminalStatuses = new Set<JobDetails["status"]>(["completed", "failed", "cancelled"]);

const statusLabels: Record<JobDetails["status"], string> = {
  queued: "В очереди",
  running: "В работе",
  completed: "Готово",
  failed: "Ошибка",
  cancelled: "Остановлено"
};

const phaseLabels: Record<Exclude<JobDetails["phase"], null>, string> = {
  preprocessing: "Подготовка фото",
  finalizing: "Финальная сборка"
};

function isTerminalStatus(status: JobDetails["status"]): boolean {
  return terminalStatuses.has(status);
}

function mergeEvents(current: JobEvent[], incoming: JobEvent): JobEvent[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  byId.set(incoming.id, incoming);

  return Array.from(byId.values()).sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function mapRealtimeEvent(payload: Record<string, unknown>): JobEvent | null {
  if (!payload.id || !payload.event_type || !payload.created_at) {
    return null;
  }

  return {
    id: String(payload.id),
    eventType: String(payload.event_type),
    payload: (payload.payload as Record<string, unknown>) ?? {},
    createdAt: String(payload.created_at)
  };
}

function applyRealtimeJobUpdate(current: JobDetails, payload: Record<string, unknown>): JobDetails {
  return {
    ...current,
    status: String(payload.status ?? current.status) as JobDetails["status"],
    phase:
      payload.phase === null || payload.phase === undefined
        ? current.phase
        : (String(payload.phase) as JobDetails["phase"]),
    progressPercent: Number(payload.progress_percent ?? current.progressPercent),
    totalPhotos: Number(payload.total_photos ?? current.totalPhotos),
    processedPhotos: Number(payload.processed_photos ?? current.processedPhotos),
    errorMessage:
      payload.error_message === null || payload.error_message === undefined
        ? null
        : String(payload.error_message),
    startedAt:
      payload.started_at === null || payload.started_at === undefined
        ? null
        : String(payload.started_at),
    finishedAt:
      payload.finished_at === null || payload.finished_at === undefined
        ? null
        : String(payload.finished_at),
    createdAt: payload.created_at ? String(payload.created_at) : current.createdAt,
    uploadId:
      payload.input_batch_id === null || payload.input_batch_id === undefined
        ? current.uploadId
        : String(payload.input_batch_id)
  };
}

async function fetchJobSnapshot(
  workspaceId: string,
  jobId: string
): Promise<JobSnapshotResponse | null> {
  const response = await fetch(`/api/workspaces/${workspaceId}/jobs/${jobId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as JobSnapshotResponse;
}

export function JobDetailsLive({
  workspaceId,
  initialJob,
  initialRuntimeHealth
}: JobDetailsLiveProps) {
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const [job, setJob] = useState(initialJob);
  const [runtimeHealth, setRuntimeHealth] = useState(initialRuntimeHealth);
  const [jobChannelReady, setJobChannelReady] = useState<boolean | null>(null);
  const [eventsChannelReady, setEventsChannelReady] = useState<boolean | null>(null);

  if (!clientRef.current) {
    clientRef.current = createSupabaseBrowserClient();
  }

  const isTerminal = isTerminalStatus(job.status);
  const shouldPoll = !isTerminal && (jobChannelReady === false || eventsChannelReady === false);
  const copy = getJobCopy(job);
  const workerRuntime = runtimeHealth?.checks.workerRuntime ?? null;
  const queueCheck = runtimeHealth?.checks.queue ?? null;

  useEffect(() => {
    const supabase = clientRef.current;
    if (!supabase) {
      return;
    }

    const jobChannel = supabase
      .channel(`processing-job-${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "processing_jobs",
          filter: `id=eq.${job.id}`
        },
        (payload) => {
          const nextRow = (payload.new as Record<string, unknown> | null) ?? null;
          if (!nextRow) {
            return;
          }

          setJob((current) => applyRealtimeJobUpdate(current, nextRow));
          if (String(nextRow.status ?? "queued") !== "queued") {
            setRuntimeHealth(null);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setJobChannelReady(true);
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setJobChannelReady(false);
        }
      });

    const eventsChannel = supabase
      .channel(`job-events-${job.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_events",
          filter: `job_id=eq.${job.id}`
        },
        (payload) => {
          const nextEvent = mapRealtimeEvent((payload.new as Record<string, unknown> | null) ?? {});
          if (!nextEvent) {
            return;
          }

          setJob((current) => ({
            ...current,
            events: mergeEvents(current.events, nextEvent)
          }));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setEventsChannelReady(true);
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setEventsChannelReady(false);
        }
      });

    return () => {
      void supabase.removeChannel(jobChannel);
      void supabase.removeChannel(eventsChannel);
    };
  }, [job.id]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const snapshot = await fetchJobSnapshot(workspaceId, job.id);
      if (!snapshot || cancelled) {
        return;
      }

      setJob(snapshot.job);
      setRuntimeHealth(snapshot.runtimeHealth);
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job.id, shouldPoll, workspaceId]);

  return (
    <>
      {shouldPoll ? (
        <p className="notice info" style={{ marginBottom: 24 }}>
          Live-обновление временно недоступно. Экран перешёл на fallback polling раз в 15 секунд.
        </p>
      ) : null}

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <article className="summary-card">
          <span className="summary-card-label">Статус</span>
          <div className="summary-card-value">
            <span className={`status-badge status-${job.status}`}>{statusLabels[job.status]}</span>
          </div>
          <small className="summary-card-hint">Текущее состояние этой задачи</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Фаза</span>
          <div className="summary-card-value">
            {job.phase ? phaseLabels[job.phase] : "Фаза не определена"}
          </div>
          <small className="summary-card-hint">Какой этап pipeline выполняется сейчас</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Прогресс</span>
          <div className="summary-card-value">{percent(job.progressPercent)}</div>
          <small className="summary-card-hint">Насколько далеко продвинулся текущий запуск</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Фото</span>
          <div className="summary-card-value">
            {job.processedPhotos} / {job.totalPhotos}
          </div>
          <small className="summary-card-hint">Сколько файлов уже дошло до конца своего preprocessing</small>
        </article>
      </section>

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <article className="summary-card">
          <span className="summary-card-label">Старт</span>
          <div className="summary-card-value">{formatDate(job.startedAt)}</div>
          <small className="summary-card-hint">Когда pipeline перешёл в активную работу</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Завершение</span>
          <div className="summary-card-value">{formatDate(job.finishedAt)}</div>
          <small className="summary-card-hint">Когда обработка закончилась или остановилась</small>
        </article>
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
                отсутствует, pipeline может застрять на `queued`, `preprocessing` или `finalizing`.
              </p>
            </article>
            <article className="check-card">
              <strong>Проверьте worker runtime</strong>
              <p>
                У worker должны быть `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`, иначе он
                не сможет стартовать, забирать photo tasks из очереди, запускать финализацию и писать heartbeat.
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
          <section className="empty-state">
            <span className="eyebrow">Спокойная зона</span>
            <h2>История пока пуста</h2>
            <p className="muted">
              События появятся, как только сервис начнёт обновлять статус этой обработки.
            </p>
          </section>
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
