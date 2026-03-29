import { NextRequest, NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  activateProcessingJob,
  enqueuePhotoTasks,
  ensureActiveUploadJob,
  findActiveUploadJob,
  logJobEvent,
  syncProcessingJobProgress
} from "@/lib/upload-pipeline";

interface FilePayload {
  storagePath: string;
  checksum?: string;
  width?: number;
  height?: number;
}

interface RegisterPhotosBody {
  file?: FilePayload;
  files?: FilePayload[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; uploadId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId, uploadId } = await context.params;
  const body = (await request.json()) as RegisterPhotosBody;
  const files = body.files ?? (body.file ? [body.file] : []);

  if (files.length === 0) {
    return NextResponse.json({ error: "files are required" }, { status: 400 });
  }

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

  if (upload.sealed_at) {
    return NextResponse.json(
      { error: "Upload batch is already sealed" },
      { status: 409 }
    );
  }

  const uniqueFiles = Array.from(
    new Map(files.map((file) => [file.storagePath, file])).values()
  );

  const { data: existingPhotos, error: existingPhotosError } = await supabase
    .from("photos")
    .select("id, storage_path")
    .eq("upload_id", uploadId)
    .in(
      "storage_path",
      uniqueFiles.map((file) => file.storagePath)
    );

  if (existingPhotosError) {
    return NextResponse.json({ error: existingPhotosError.message }, { status: 500 });
  }

  const existingByPath = new Map(
    (existingPhotos ?? []).map((photo: Record<string, unknown>) => [
      String(photo.storage_path),
      {
        id: String(photo.id),
        storage_path: String(photo.storage_path)
      }
    ])
  );

  const rows = uniqueFiles
    .filter((file) => !existingByPath.has(file.storagePath))
    .map((file) => ({
    workspace_id: workspaceId,
    upload_id: uploadId,
    storage_path: file.storagePath,
    checksum: file.checksum ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    uploaded_by: authData.user?.id
  }));

  const insertedPhotos: Array<{ id: string; storage_path: string }> = [];

  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("photos")
      .insert(rows)
      .select("id, storage_path");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    insertedPhotos.push(
      ...((data ?? []).map((photo: Record<string, unknown>) => ({
        id: String(photo.id),
        storage_path: String(photo.storage_path)
      })) as Array<{ id: string; storage_path: string }>)
    );
  }

  const insertedByPath = new Map(insertedPhotos.map((photo) => [photo.storage_path, photo]));
  const orderedPhotos = uniqueFiles
    .map((file) => insertedByPath.get(file.storagePath) ?? existingByPath.get(file.storagePath))
    .filter((photo): photo is { id: string; storage_path: string } => Boolean(photo));

  const activeJob = await findActiveUploadJob(supabase, workspaceId, uploadId);
  const job =
    activeJob ??
    (rows.length > 0
      ? await ensureActiveUploadJob(supabase, workspaceId, uploadId, authData.user.id)
      : null);

  if (!job) {
    return NextResponse.json(
      {
        photos: orderedPhotos,
        job: null
      },
      { status: 200 }
    );
  }

  try {
    await enqueuePhotoTasks(supabase, workspaceId, uploadId, job.id, insertedPhotos);
    await activateProcessingJob(supabase, job.id);

    await Promise.all(
      insertedPhotos.map((photo) =>
        logJobEvent(supabase, job.id, "photo_registered", {
          photo_id: photo.id,
          storage_path: photo.storage_path
        })
      )
    );

    const { error: uploadStatusError } = await supabase
      .from("photo_uploads")
      .update({ status: "uploading" })
      .eq("id", uploadId)
      .eq("workspace_id", workspaceId);

    if (uploadStatusError) {
      throw new Error(uploadStatusError.message);
    }

    const syncedJob = await syncProcessingJobProgress(supabase, job.id);

    return NextResponse.json(
      {
        photos: orderedPhotos,
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
    const message =
      error instanceof Error ? error.message : "Не удалось зарегистрировать фотографии";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
