import { NextRequest, NextResponse } from "next/server";

import { hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface FilePayload {
  storagePath: string;
  checksum?: string;
  width?: number;
  height?: number;
}

interface RegisterPhotosBody {
  files?: FilePayload[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; uploadId: string }> }
) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId, uploadId } = await context.params;
  const body = (await request.json()) as RegisterPhotosBody;

  if (!body.files || body.files.length === 0) {
    return NextResponse.json({ error: "files are required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = body.files.map((file) => ({
    workspace_id: workspaceId,
    upload_id: uploadId,
    storage_path: file.storagePath,
    checksum: file.checksum ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    uploaded_by: authData.user?.id
  }));

  const { data, error } = await supabase
    .from("photos")
    .insert(rows)
    .select("id, storage_path");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: uploadStatusError } = await supabase
    .from("photo_uploads")
    .update({ status: "uploaded" })
    .eq("id", uploadId)
    .eq("workspace_id", workspaceId);

  if (uploadStatusError) {
    return NextResponse.json({ error: uploadStatusError.message }, { status: 500 });
  }

  return NextResponse.json({ photos: data }, { status: 201 });
}

