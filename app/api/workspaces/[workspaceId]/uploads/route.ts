import { NextRequest, NextResponse } from "next/server";

import { hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface UploadRequestBody {
  name?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> }
) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId } = await context.params;
  const body = (await request.json()) as UploadRequestBody;

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("photo_uploads")
    .insert({
      workspace_id: workspaceId,
      name: body.name,
      status: "uploading",
      uploaded_by: authData.user.id
    })
    .select("id, workspace_id, name, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    upload: data,
    storagePrefix: `${workspaceId}/${data.id}`
  });
}
