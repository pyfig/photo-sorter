import { createClient } from "@supabase/supabase-js";

import { getRequiredAdminEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const env = getRequiredAdminEnv();

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
