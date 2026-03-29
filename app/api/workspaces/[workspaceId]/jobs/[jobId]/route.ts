import { NextResponse } from "next/server";

import { getJobDetails } from "@/lib/data";
import { hasRequiredWebEnv } from "@/lib/env";
import { getRuntimeHealthSnapshot } from "@/lib/runtime-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; jobId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, jobId } = await context.params;
  const job = await getJobDetails(workspaceId, jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const runtimeHealth =
    job.status === "queued" || job.status === "running"
      ? await getRuntimeHealthSnapshot()
      : null;

  return NextResponse.json({
    job,
    runtimeHealth
  });
}
