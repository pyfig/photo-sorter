"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getRequiredWebEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getRequiredWebEnv();

  return createBrowserClient(
    env.supabaseUrl,
    env.supabaseAnonKey
  );
}
