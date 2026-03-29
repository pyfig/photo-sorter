import { NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  findActiveUploadJob,
  logJobEvent,
  syncProcessingJobProgress
} from "@/lib/upload-pipeline";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; uploadId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId, uploadId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: upload, error: uploadError } = await supabase
    .from("photo_uploads")
    .select("id, status, sealed_at")
    .eq("id", uploadId)
    .eq("workspace_id", workspaceId)
    .single();

  if (uploadError || !upload) {
    return NextResponse.json(
      { error: "Upload batch not found for workspace" },
      { status: 404 }
    );
  }

  const activeJob = await findActiveUploadJob(supabase, workspaceId, uploadId);

  const sealedAt = upload.sealed_at ? String(upload.sealed_at) : new Date().toISOString();
  const { data: updatedUpload, error: updateError } = await supabase
    .from("photo_uploads")
    .update({
      status: "uploaded",
      sealed_at: sealedAt
    })
    .eq("id", uploadId)
    .eq("workspace_id", workspaceId)
    .select("id, status, sealed_at")
    .single();

  if (updateError || !updatedUpload) {
    return NextResponse.json(
      { error: updateError?.message ?? "Не удалось закрыть upload batch" },
      { status: 500 }
    );
  }

  if (!activeJob) {
    return NextResponse.json(
      {
        upload: updatedUpload,
        job: null
      },
      { status: 200 }
    );
  }

  await logJobEvent(supabase, activeJob.id, "upload_sealed", {
    upload_id: uploadId,
    sealed_at: sealedAt
  });

  const syncedJob = await syncProcessingJobProgress(supabase, activeJob.id);

  return NextResponse.json(
    {
      upload: updatedUpload,
      job: {
        id: syncedJob.id,
        status: syncedJob.status,
        phase: syncedJob.phase,
        progressPercent: syncedJob.progress_percent ?? 0,
        totalPhotos: syncedJob.total_photos ?? 0,
        processedPhotos: syncedJob.processed_photos ?? 0
      }
    },
    { status: 200 }
  );
}
