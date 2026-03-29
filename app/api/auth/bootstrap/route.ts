import { NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { ensureSharedWorkspaceAccess } from "@/lib/shared-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/utils";

interface BootstrapRequestBody {
  accessToken?: string;
  refreshToken?: string;
  next?: string;
}

export async function POST(request: Request) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  let body: BootstrapRequestBody = {};

  try {
    body = (await request.json()) as BootstrapRequestBody;
  } catch {
    // Allow empty bodies and fall back to cookie-based session lookup.
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = normalizeNextPath(body.next);

  if (body.accessToken && body.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: body.accessToken,
      refresh_token: body.refreshToken
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
  }

  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSharedWorkspaceAccess(supabase);
  } catch (bootstrapError) {
    return NextResponse.json(
      {
        error:
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Не удалось подготовить общий workspace."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ redirectTo });
}
