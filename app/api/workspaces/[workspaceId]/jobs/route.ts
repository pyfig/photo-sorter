import { NextRequest, NextResponse } from "next/server";

import { hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface JobRequestBody {
  uploadId?: string;
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
  const body = (await request.json()) as JobRequestBody;

  if (!body.uploadId) {
    return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      workspace_id: workspaceId,
      input_batch_id: body.uploadId,
      status: "queued",
      progress_percent: 0,
      created_by: authData.user.id
    })
    .select("id, workspace_id, input_batch_id, status, progress_percent")
    .single();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("job_events").insert({
    job_id: job.id,
    event_type: "job_created",
    payload: {
      source: "web-api",
      upload_id: body.uploadId
    }
  });

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  return NextResponse.json({ job }, { status: 201 });
}
