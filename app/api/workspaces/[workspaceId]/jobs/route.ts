import { NextRequest, NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  activateProcessingJob,
  createUploadProcessingJob,
  enqueuePhotoTasks,
  findActiveUploadJob,
  syncProcessingJobProgress
} from "@/lib/upload-pipeline";

interface JobRequestBody {
  uploadId?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId } = await context.params;
  const body = (await request.json()) as JobRequestBody;

  if (!body.uploadId) {
    return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: upload, error: uploadError } = await supabase
    .from("photo_uploads")
    .select("id")
    .eq("id", body.uploadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (uploadError || !upload) {
    return NextResponse.json(
      { error: "Upload batch not found for workspace" },
      { status: 404 }
    );
  }

  const existingJob = await findActiveUploadJob(supabase, workspaceId, body.uploadId);
  if (existingJob) {
    return NextResponse.json(
      {
        job: {
          id: existingJob.id,
          status: existingJob.status,
          phase: existingJob.phase,
          progressPercent: existingJob.progress_percent ?? 0,
          totalPhotos: existingJob.total_photos ?? 0,
          processedPhotos: existingJob.processed_photos ?? 0
        }
      },
      { status: 200 }
    );
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("id, storage_path")
    .eq("upload_id", body.uploadId)
    .order("created_at", { ascending: true });

  if (photosError) {
    return NextResponse.json({ error: photosError.message }, { status: 500 });
  }

  if (!photos || photos.length === 0) {
    return NextResponse.json(
      { error: "Upload batch has no registered photos" },
      { status: 400 }
    );
  }

  try {
    const job = await createUploadProcessingJob(
      supabase,
      workspaceId,
      body.uploadId,
      authData.user.id
    );

    await enqueuePhotoTasks(
      supabase,
      workspaceId,
      body.uploadId,
      job.id,
      photos.map((photo: Record<string, unknown>) => ({
        id: String(photo.id),
        storage_path: String(photo.storage_path)
        }))
    );

    await activateProcessingJob(supabase, job.id);
    const syncedJob = await syncProcessingJobProgress(supabase, job.id);

    return NextResponse.json(
      {
        job: {
          id: syncedJob.id,
          status: syncedJob.status,
          phase: syncedJob.phase,
          progressPercent: syncedJob.progress_percent ?? 0,
          totalPhotos: syncedJob.total_photos ?? 0,
          processedPhotos: syncedJob.processed_photos ?? 0
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не удалось создать processing job"
      },
      { status: 500 }
    );
  }
}
