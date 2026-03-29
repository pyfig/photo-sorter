import { NextResponse } from "next/server";

import { getWorkspaceOverview } from "@/lib/data";
import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> }
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

  const { workspaceId } = await context.params;
  const workspace = await getWorkspaceOverview(workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json(workspace);
}
