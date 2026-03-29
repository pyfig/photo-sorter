import { getAdminEnvCheck, getWebEnvCheck, hasRequiredAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CheckStatus = "ok" | "error";

const DEFAULT_WORKER_POLL_INTERVAL_SECONDS = 10;
const MIN_WORKER_STALE_AFTER_SECONDS = 30;
const WORKER_STALE_AFTER_MULTIPLIER = 3;

interface WorkerHeartbeatRow {
  worker_id: string;
  runtime_status: string;
  poll_interval_seconds: number;
  current_job_id: string | null;
  current_job_started_at: string | null;
  last_job_id: string | null;
  last_completed_at: string | null;
  last_error: string | null;
  last_seen_at: string;
}

export interface WorkerRuntimeCheck {
  status: CheckStatus;
  error: string | null;
  workerId: string | null;
  runtimeStatus: string | null;
  pollIntervalSeconds: number | null;
  lastSeenAt: string | null;
  lastSeenAgeSeconds: number | null;
  staleAfterSeconds: number | null;
  currentJobId: string | null;
  currentJobStartedAt: string | null;
  lastJobId: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
}

export interface RuntimeHealthSnapshot {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  checks: {
    webEnv: {
      status: CheckStatus;
      missing: string[];
    };
    adminEnv: {
      status: CheckStatus;
      missing: string[];
    };
    supabase: {
      status: CheckStatus;
      error: string | null;
    };
    workerRuntime: WorkerRuntimeCheck;
    queue: {
      status: CheckStatus;
      error: string | null;
      queuedJobs: number;
      runningJobs: number;
      oldestQueuedAt: string | null;
    };
  };
}

function getWorkerStaleAfterSeconds(pollIntervalSeconds: number | null): number {
  return Math.max(
    MIN_WORKER_STALE_AFTER_SECONDS,
    (pollIntervalSeconds ?? DEFAULT_WORKER_POLL_INTERVAL_SECONDS) * WORKER_STALE_AFTER_MULTIPLIER
  );
}

function getLastSeenAgeSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const lastSeen = new Date(value);
  if (Number.isNaN(lastSeen.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 1000));
}

function buildWorkerRuntimeCheck(
  latestHeartbeat: WorkerHeartbeatRow | null,
  heartbeatError: string | null
): WorkerRuntimeCheck {
  if (heartbeatError) {
    return {
      status: "error",
      error: heartbeatError,
      workerId: null,
      runtimeStatus: null,
      pollIntervalSeconds: null,
      lastSeenAt: null,
      lastSeenAgeSeconds: null,
      staleAfterSeconds: null,
      currentJobId: null,
      currentJobStartedAt: null,
      lastJobId: null,
      lastCompletedAt: null,
      lastError: null
    };
  }

  if (!latestHeartbeat) {
    return {
      status: "error",
      error: "Worker heartbeat не найден. Отдельный Python worker не стартовал или ещё не публиковал liveness.",
      workerId: null,
      runtimeStatus: null,
      pollIntervalSeconds: null,
      lastSeenAt: null,
      lastSeenAgeSeconds: null,
      staleAfterSeconds: null,
      currentJobId: null,
      currentJobStartedAt: null,
      lastJobId: null,
      lastCompletedAt: null,
      lastError: null
    };
  }

  const lastSeenAgeSeconds = getLastSeenAgeSeconds(latestHeartbeat.last_seen_at);
  const staleAfterSeconds = getWorkerStaleAfterSeconds(latestHeartbeat.poll_interval_seconds);

  if (lastSeenAgeSeconds === null) {
    return {
      status: "error",
      error: `Worker ${latestHeartbeat.worker_id} записал некорректный heartbeat timestamp.`,
      workerId: latestHeartbeat.worker_id,
      runtimeStatus: latestHeartbeat.runtime_status,
      pollIntervalSeconds: latestHeartbeat.poll_interval_seconds,
      lastSeenAt: latestHeartbeat.last_seen_at,
      lastSeenAgeSeconds: null,
      staleAfterSeconds,
      currentJobId: latestHeartbeat.current_job_id,
      currentJobStartedAt: latestHeartbeat.current_job_started_at,
      lastJobId: latestHeartbeat.last_job_id,
      lastCompletedAt: latestHeartbeat.last_completed_at,
      lastError: latestHeartbeat.last_error
    };
  }

  if (lastSeenAgeSeconds > staleAfterSeconds) {
    return {
      status: "error",
      error: `Heartbeat worker ${latestHeartbeat.worker_id} устарел: ${lastSeenAgeSeconds} сек. назад при допустимом окне ${staleAfterSeconds} сек.`,
      workerId: latestHeartbeat.worker_id,
      runtimeStatus: latestHeartbeat.runtime_status,
      pollIntervalSeconds: latestHeartbeat.poll_interval_seconds,
      lastSeenAt: latestHeartbeat.last_seen_at,
      lastSeenAgeSeconds,
      staleAfterSeconds,
      currentJobId: latestHeartbeat.current_job_id,
      currentJobStartedAt: latestHeartbeat.current_job_started_at,
      lastJobId: latestHeartbeat.last_job_id,
      lastCompletedAt: latestHeartbeat.last_completed_at,
      lastError: latestHeartbeat.last_error
    };
  }

  return {
    status: "ok",
    error: null,
    workerId: latestHeartbeat.worker_id,
    runtimeStatus: latestHeartbeat.runtime_status,
    pollIntervalSeconds: latestHeartbeat.poll_interval_seconds,
    lastSeenAt: latestHeartbeat.last_seen_at,
    lastSeenAgeSeconds,
    staleAfterSeconds,
    currentJobId: latestHeartbeat.current_job_id,
    currentJobStartedAt: latestHeartbeat.current_job_started_at,
    lastJobId: latestHeartbeat.last_job_id,
    lastCompletedAt: latestHeartbeat.last_completed_at,
    lastError: latestHeartbeat.last_error
  };
}

export async function getRuntimeHealthSnapshot(): Promise<RuntimeHealthSnapshot> {
  const webEnv = getWebEnvCheck();
  const adminEnv = getAdminEnvCheck();
  let supabaseStatus: CheckStatus = "error";
  let supabaseError: string | null = null;
  let queuedJobs = 0;
  let runningJobs = 0;
  let oldestQueuedAt: string | null = null;
  let queueError: string | null = null;
  let heartbeatError: string | null = null;
  let latestHeartbeat: WorkerHeartbeatRow | null = null;

  if (hasRequiredAdminEnv()) {
    try {
      const supabase = createSupabaseAdminClient();
      const [
        { error: workspaceError },
        { count: queuedCount, error: queuedCountError },
        { count: runningCount, error: runningCountError },
        { data: oldestQueued, error: oldestQueuedError },
        { data: heartbeats, error: heartbeatsError }
      ] = await Promise.all([
        supabase.from("workspaces").select("id").limit(1),
        supabase
          .from("processing_jobs")
          .select("*", { count: "exact", head: true })
          .eq("status", "queued"),
        supabase
          .from("processing_jobs")
          .select("*", { count: "exact", head: true })
          .eq("status", "running"),
        supabase
          .from("processing_jobs")
          .select("created_at")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(1),
        supabase
          .from("worker_heartbeats")
          .select(
            "worker_id, runtime_status, poll_interval_seconds, current_job_id, current_job_started_at, last_job_id, last_completed_at, last_error, last_seen_at"
          )
          .order("last_seen_at", { ascending: false })
          .limit(1)
      ]);

      supabaseStatus = workspaceError ? "error" : "ok";
      supabaseError = workspaceError?.message ?? null;

      if (queuedCountError || runningCountError || oldestQueuedError) {
        queueError =
          queuedCountError?.message ??
          runningCountError?.message ??
          oldestQueuedError?.message ??
          "Unknown queue error";
      } else {
        queuedJobs = queuedCount ?? 0;
        runningJobs = runningCount ?? 0;
        oldestQueuedAt = oldestQueued?.[0]?.created_at ?? null;
      }

      heartbeatError = heartbeatsError?.message ?? null;
      latestHeartbeat = ((heartbeats?.[0] ?? null) as WorkerHeartbeatRow | null) ?? null;
    } catch (error) {
      supabaseStatus = "error";
      supabaseError = error instanceof Error ? error.message : "Unknown Supabase error";
      queueError = supabaseError;
      heartbeatError = supabaseError;
    }
  } else {
    supabaseError = "Admin env is not configured";
    queueError = "Queue diagnostics require admin env";
    heartbeatError = "Worker runtime diagnostics require admin env";
  }

  const workerRuntime = buildWorkerRuntimeCheck(latestHeartbeat, heartbeatError);

  let queueStatus: CheckStatus = queueError ? "error" : "ok";
  if (!queueError && workerRuntime.status === "error" && queuedJobs > 0 && runningJobs === 0) {
    queueStatus = "error";
    queueError = workerRuntime.error;
  }

  if (!queueError && workerRuntime.status === "error" && runningJobs > 0) {
    queueStatus = "error";
    queueError =
      workerRuntime.error ??
      "Есть jobs в running, но heartbeat worker отсутствует или устарел. Возможен orphaned processing.";
  }

  const status =
    webEnv.ok &&
    adminEnv.ok &&
    supabaseStatus === "ok" &&
    workerRuntime.status === "ok" &&
    queueStatus === "ok"
      ? "ok"
      : "degraded";

  return {
    status,
    service: "photo-sorter-web",
    timestamp: new Date().toISOString(),
    checks: {
      webEnv: {
        status: webEnv.ok ? "ok" : "error",
        missing: webEnv.missing
      },
      adminEnv: {
        status: adminEnv.ok ? "ok" : "error",
        missing: adminEnv.missing
      },
      supabase: {
        status: supabaseStatus,
        error: supabaseError
      },
      workerRuntime,
      queue: {
        status: queueStatus,
        error: queueError,
        queuedJobs,
        runningJobs,
        oldestQueuedAt
      }
    }
  };
}
