import { NextResponse } from "next/server";

import { getAdminEnvCheck, getWebEnvCheck, hasRequiredAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const webEnv = getWebEnvCheck();
  const adminEnv = getAdminEnvCheck();
  let supabaseStatus: "ok" | "error" = "error";
  let supabaseError: string | null = null;

  if (hasRequiredAdminEnv()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("workspaces").select("id").limit(1);
      supabaseStatus = error ? "error" : "ok";
      supabaseError = error?.message ?? null;
    } catch (error) {
      supabaseStatus = "error";
      supabaseError = error instanceof Error ? error.message : "Unknown Supabase error";
    }
  } else {
    supabaseError = "Admin env is not configured";
  }

  const status =
    webEnv.ok && adminEnv.ok && supabaseStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json({
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
      }
    }
  }, {
    status: status === "ok" ? 200 : 503
  });
}
