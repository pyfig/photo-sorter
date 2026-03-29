"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RecentJob, WorkspaceOverview } from "@/lib/types";
import { formatDate, percent, shortId } from "@/lib/utils";

interface WorkspaceLiveOverviewProps {
  initialWorkspace: WorkspaceOverview;
}

const statusLabels: Record<RecentJob["status"], string> = {
  queued: "В очереди",
  running: "В работе",
  completed: "Готово",
  failed: "Ошибка",
  cancelled: "Остановлено"
};

const phaseLabels: Record<Exclude<RecentJob["phase"], null>, string> = {
  preprocessing: "Подготовка фото",
  finalizing: "Финальная сборка"
};

function mapRecentJob(payload: Record<string, unknown>): RecentJob | null {
  if (!payload.id || !payload.status || !payload.created_at) {
    return null;
  }

  return {
    id: String(payload.id),
    status: String(payload.status) as RecentJob["status"],
    phase:
      payload.phase === null || payload.phase === undefined
        ? null
        : (String(payload.phase) as RecentJob["phase"]),
    progressPercent: Number(payload.progress_percent ?? 0),
    totalPhotos: Number(payload.total_photos ?? 0),
    processedPhotos: Number(payload.processed_photos ?? 0),
    createdAt: String(payload.created_at),
    finishedAt:
      payload.finished_at === null || payload.finished_at === undefined
        ? null
        : String(payload.finished_at)
  };
}

function upsertRecentJobs(current: RecentJob[], incoming: RecentJob): RecentJob[] {
  const jobsById = new Map(current.map((job) => [job.id, job]));
  jobsById.set(incoming.id, incoming);

  return Array.from(jobsById.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);
}

async function fetchWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceOverview | null> {
  const response = await fetch(`/api/workspaces/${workspaceId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as WorkspaceOverview;
}

export function WorkspaceLiveOverview({
  initialWorkspace
}: WorkspaceLiveOverviewProps) {
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [jobsChannelReady, setJobsChannelReady] = useState<boolean | null>(null);
  const [clustersChannelReady, setClustersChannelReady] = useState<boolean | null>(null);

  if (!clientRef.current) {
    clientRef.current = createSupabaseBrowserClient();
  }

  const shouldPoll = jobsChannelReady === false || clustersChannelReady === false;

  useEffect(() => {
    const supabase = clientRef.current;
    if (!supabase) {
      return;
    }

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        void fetchWorkspaceSnapshot(workspace.id).then((snapshot) => {
          if (snapshot) {
            setWorkspace(snapshot);
          }
        });
      }, 400);
    };

    const jobsChannel = supabase
      .channel(`workspace-jobs-${workspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "processing_jobs",
          filter: `workspace_id=eq.${workspace.id}`
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            scheduleRefresh();
            return;
          }

          const nextJob = mapRecentJob((payload.new as Record<string, unknown> | null) ?? {});
          if (!nextJob) {
            scheduleRefresh();
            return;
          }

          setWorkspace((current) => ({
            ...current,
            recentJobs: upsertRecentJobs(current.recentJobs, nextJob)
          }));

          if (
            payload.eventType === "INSERT" ||
            nextJob.status === "completed" ||
            nextJob.status === "failed" ||
            nextJob.status === "cancelled"
          ) {
            scheduleRefresh();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setJobsChannelReady(true);
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setJobsChannelReady(false);
        }
      });

    const clustersChannel = supabase
      .channel(`workspace-clusters-${workspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "person_clusters",
          filter: `workspace_id=eq.${workspace.id}`
        },
        () => {
          scheduleRefresh();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setClustersChannelReady(true);
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setClustersChannelReady(false);
        }
      });

    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      void supabase.removeChannel(jobsChannel);
      void supabase.removeChannel(clustersChannel);
    };
  }, [workspace.id]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const snapshot = await fetchWorkspaceSnapshot(workspace.id);
      if (!snapshot || cancelled) {
        return;
      }

      setWorkspace(snapshot);
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [shouldPoll, workspace.id]);

  return (
    <>
      {shouldPoll ? (
        <p className="notice info" style={{ marginBottom: 24 }}>
          Live-обновление workspace временно недоступно. Включён fallback polling раз в 15 секунд.
        </p>
      ) : null}

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <article className="summary-card">
          <span className="summary-card-label">Фото</span>
          <div className="summary-card-value">{workspace.totalPhotos}</div>
          <small className="summary-card-hint">Кадры, уже живущие в этом пространстве</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Люди</span>
          <div className="summary-card-value">{workspace.peopleCount}</div>
          <small className="summary-card-hint">Готовые группы после завершённых запусков</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Загрузки</span>
          <div className="summary-card-value">{workspace.uploadCount}</div>
          <small className="summary-card-hint">Все партии, зарегистрированные в проекте</small>
        </article>
        <article className="summary-card">
          <span className="summary-card-label">Адрес проекта</span>
          <div className="summary-card-value">/{workspace.slug}</div>
          <small className="summary-card-hint">Постоянный путь для навигации внутри системы</small>
        </article>
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="section-heading">
          <h2>Последние результаты</h2>
          <span className="muted">Готовые группы людей, которые уже можно открыть и проверить</span>
        </div>

        {workspace.recentClusters.length === 0 ? (
          <section className="empty-state">
            <span className="eyebrow">Спокойная зона</span>
            <h2>Результатов пока нет</h2>
            <p className="muted">
              Загрузите фотографии и дождитесь завершения обработки. Как только сервис найдёт группы людей, они появятся здесь.
            </p>
          </section>
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
                    <span>Превью появится после обработки</span>
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
        <div className="section-heading">
          <h2>Последние обработки</h2>
          <span className="muted">Статус, прогресс и время завершения по недавним запускам</span>
        </div>
        {workspace.recentJobs.length === 0 ? (
          <section className="empty-state">
            <span className="eyebrow">Спокойная зона</span>
            <h2>Обработок пока нет</h2>
            <p className="muted">
              Перейдите к загрузке фотографий. Первый processing job создастся автоматически на первом успешно зарегистрированном файле.
            </p>
          </section>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Обработка</th>
                  <th>Статус</th>
                  <th>Прогресс</th>
                  <th>Создана</th>
                  <th>Завершена</th>
                </tr>
              </thead>
              <tbody>
                {workspace.recentJobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/workspaces/${workspace.id}/jobs/${job.id}`}>
                        Обработка #{shortId(job.id)}
                      </Link>
                    </td>
                    <td>
                      <div className="grid" style={{ gap: 8 }}>
                        <span className={`status-badge status-${job.status}`}>{statusLabels[job.status]}</span>
                        {job.phase ? <span className="muted">{phaseLabels[job.phase]}</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="grid" style={{ gap: 8 }}>
                        <span>{percent(job.progressPercent)}</span>
                        <span className="muted">
                          {job.processedPhotos} / {job.totalPhotos} фото
                        </span>
                      </div>
                    </td>
                    <td>{formatDate(job.createdAt)}</td>
                    <td>{formatDate(job.finishedAt)}</td>
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
