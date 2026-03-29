import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { ensureSharedWorkspaceAccess } from "@/lib/shared-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeNextPath } from "@/lib/utils";

function redirectToLogin(request: NextRequest, message: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("message", message);
  return NextResponse.redirect(loginUrl);
}

function resolveRedirectTarget(request: NextRequest): URL {
  const requestUrl = new URL(request.url);
  const redirectTo = requestUrl.searchParams.get("redirect_to");

  if (redirectTo) {
    try {
      const redirectUrl = new URL(redirectTo, requestUrl);

      if (redirectUrl.origin === requestUrl.origin) {
        if (redirectUrl.pathname === "/auth/confirm") {
          return new URL(
            normalizeNextPath(redirectUrl.searchParams.get("next")),
            requestUrl
          );
        }

        return new URL(
          `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`,
          requestUrl
        );
      }
    } catch {
      // Fall through to `next`.
    }
  }

  return new URL(
    normalizeNextPath(requestUrl.searchParams.get("next")),
    requestUrl
  );
}

export async function GET(request: NextRequest) {
  if (!hasRequiredWebEnv()) {
    return redirectToLogin(request, "Supabase env не настроены.");
  }

  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const code = requestUrl.searchParams.get("code");
  const redirectTarget = resolveRedirectTarget(request);

  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectToLogin(request, error.message);
    }

    try {
      await ensureSharedWorkspaceAccess(supabase);
    } catch (bootstrapError) {
      return redirectToLogin(
        request,
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "Не удалось подготовить общий workspace."
      );
    }

    return NextResponse.redirect(redirectTarget);
  }

  if (!tokenHash || !type) {
    return redirectToLogin(request, "Magic link недействителен или неполон.");
  }

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash
  });

  if (error) {
    return redirectToLogin(request, error.message);
  }

  try {
    await ensureSharedWorkspaceAccess(supabase);
  } catch (bootstrapError) {
    return redirectToLogin(
      request,
      bootstrapError instanceof Error
        ? bootstrapError.message
        : "Не удалось подготовить общий workspace."
    );
  }

  return NextResponse.redirect(redirectTarget);
}
