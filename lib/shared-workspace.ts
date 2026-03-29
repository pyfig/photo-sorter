import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SHARED_WORKSPACE_NAME = "TechCommunity Fest Demo";
export const SHARED_WORKSPACE_SLUG = "techcommunity-fest-demo";
export const SHARED_WORKSPACE_UPLOAD_NAME = "TechCommunity Fest Preloaded Photos";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function ensureSharedWorkspaceAccess(
  client?: ServerSupabaseClient
) {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase.rpc(
    "ensure_shared_workspace_membership",
    {
      shared_workspace_name: SHARED_WORKSPACE_NAME,
      shared_workspace_slug: SHARED_WORKSPACE_SLUG
    }
  );

  if (error) {
    throw new Error(`Shared workspace bootstrap failed: ${error.message}`);
  }

  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}
