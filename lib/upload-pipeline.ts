import type { SupabaseClient } from "@supabase/supabase-js";

interface UploadProcessingJobRow {
  id: string;
  status: string;
  phase: string | null;
  progress_percent: number | null;
  total_photos: number | null;
  processed_photos: number | null;
  input_batch_id: string;
}

interface PhotoRow {
  id: string;
  storage_path: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function getPreprocessingProgress(totalPhotos: number, processedPhotos: number): number {
  if (totalPhotos <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(80, Math.round((processedPhotos / totalPhotos) * 80)));
}

export async function logJobEvent(
  supabase: SupabaseClient,
  jobId: string,
  eventType: string,
  payload: Record<string, Json>
) {
  return supabase.from("job_events").insert({
    job_id: jobId,
    event_type: eventType,
    payload
  });
}

export async function findActiveUploadJob(
  supabase: SupabaseClient,
  workspaceId: string,
  uploadId: string
): Promise<UploadProcessingJobRow | null> {
  const { data } = await supabase
    .from("processing_jobs")
    .select(
      "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
    )
    .eq("workspace_id", workspaceId)
    .eq("input_batch_id", uploadId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data?.[0]) {
    return null;
  }

  return data[0] as UploadProcessingJobRow;
}

export async function createUploadProcessingJob(
  supabase: SupabaseClient,
  workspaceId: string,
  uploadId: string,
  userId: string
): Promise<UploadProcessingJobRow> {
  const { data, error } = await supabase
    .from("processing_jobs")
    .insert({
      workspace_id: workspaceId,
      input_batch_id: uploadId,
      created_by: userId,
      status: "queued",
      phase: "preprocessing",
      progress_percent: 0,
      total_photos: 0,
      processed_photos: 0
    })
    .select(
      "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Не удалось создать processing job");
  }

  await logJobEvent(supabase, String(data.id), "job_created", {
    source: "web-api",
    upload_id: uploadId
  });

  return data as UploadProcessingJobRow;
}

export async function ensureActiveUploadJob(
  supabase: SupabaseClient,
  workspaceId: string,
  uploadId: string,
  userId: string
): Promise<UploadProcessingJobRow> {
  const existing = await findActiveUploadJob(supabase, workspaceId, uploadId);
  if (existing) {
    return existing;
  }

  return createUploadProcessingJob(supabase, workspaceId, uploadId, userId);
}

export async function activateProcessingJob(
  supabase: SupabaseClient,
  jobId: string
) {
  const { data: currentJob, error: currentJobError } = await supabase
    .from("processing_jobs")
    .select(
      "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
    )
    .eq("id", jobId)
    .single();

  if (currentJobError || !currentJob) {
    throw new Error(currentJobError?.message ?? "Не удалось загрузить processing job");
  }

  if (String(currentJob.status) !== "queued") {
    return currentJob as UploadProcessingJobRow;
  }

  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      progress_percent: 1
    })
    .eq("id", jobId)
    .select(
      "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Не удалось активировать processing job");
  }

  return data as UploadProcessingJobRow;
}

export async function enqueuePhotoTasks(
  supabase: SupabaseClient,
  workspaceId: string,
  uploadId: string,
  jobId: string,
  photos: PhotoRow[]
) {
  if (photos.length === 0) {
    return;
  }

  const rows = photos.map((photo) => ({
    workspace_id: workspaceId,
    upload_id: uploadId,
    photo_id: photo.id,
    job_id: jobId,
    status: "queued"
  }));

  const { error } = await supabase
    .from("photo_processing_tasks")
    .upsert(rows, {
      onConflict: "photo_id,job_id",
      ignoreDuplicates: true
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncProcessingJobProgress(
  supabase: SupabaseClient,
  jobId: string
): Promise<UploadProcessingJobRow> {
  const [{ data: job, error: jobError }, { count: totalCount, error: totalError }, { count: processedCount, error: processedError }] =
    await Promise.all([
      supabase
        .from("processing_jobs")
        .select(
          "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
        )
        .eq("id", jobId)
        .single(),
      supabase
        .from("photo_processing_tasks")
        .select("*", { count: "exact", head: true })
        .eq("job_id", jobId),
      supabase
        .from("photo_processing_tasks")
        .select("*", { count: "exact", head: true })
        .eq("job_id", jobId)
        .in("status", ["completed", "failed"])
    ]);

  if (jobError || !job) {
    throw new Error(jobError?.message ?? "Не удалось загрузить processing job");
  }

  if (totalError || processedError) {
    throw new Error(totalError?.message ?? processedError?.message ?? "Не удалось посчитать progress");
  }

  const totalPhotos = totalCount ?? 0;
  const processedPhotos = processedCount ?? 0;
  const currentPhase = String(job.phase ?? "preprocessing");
  const currentProgress = Number(job.progress_percent ?? 0);
  const nextProgress =
    currentPhase === "finalizing"
      ? Math.max(currentProgress, 85)
      : getPreprocessingProgress(totalPhotos, processedPhotos);

  const { data, error } = await supabase
    .from("processing_jobs")
    .update({
      total_photos: totalPhotos,
      processed_photos: processedPhotos,
      progress_percent: nextProgress
    })
    .eq("id", jobId)
    .select(
      "id, status, phase, progress_percent, total_photos, processed_photos, input_batch_id"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Не удалось обновить progress");
  }

  return data as UploadProcessingJobRow;
}
