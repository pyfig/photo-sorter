import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/utils";

function redirectToLogin(request: NextRequest, message: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("message", message);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  if (!hasRequiredWebEnv()) {
    return redirectToLogin(request, "Supabase env не настроены.");
  }

  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = normalizeNextPath(requestUrl.searchParams.get("next"));

  if (!tokenHash || !type) {
    return redirectToLogin(request, "Magic link недействителен или неполон.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash
  });

  if (error) {
    return redirectToLogin(request, error.message);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
