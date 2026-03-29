const requiredWebEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
] as const;

const requiredAdminEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

export type WebEnvKey = (typeof requiredWebEnvKeys)[number];
export type AdminEnvKey = (typeof requiredAdminEnvKeys)[number];

export interface RuntimeCheck {
  ok: boolean;
  missing: string[];
}

function getMissingKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !process.env[key]);
}

export function getWebEnvCheck(): RuntimeCheck {
  const missing = getMissingKeys(requiredWebEnvKeys);
  return {
    ok: missing.length === 0,
    missing
  };
}

export function getAdminEnvCheck(): RuntimeCheck {
  const missing = getMissingKeys(requiredAdminEnvKeys);
  return {
    ok: missing.length === 0,
    missing
  };
}

export function hasRequiredWebEnv(): boolean {
  return getWebEnvCheck().ok;
}

export function hasRequiredAdminEnv(): boolean {
  return getAdminEnvCheck().ok;
}

export function hasSupabaseConfig(): boolean {
  return hasRequiredWebEnv();
}

export function hasSupabaseServiceRole(): boolean {
  return hasRequiredAdminEnv();
}

export function getRequiredWebEnv() {
  const check = getWebEnvCheck();

  if (!check.ok) {
    throw new Error(`Missing required web env: ${check.missing.join(", ")}`);
  }

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  };
}

export function getRequiredAdminEnv() {
  const check = getAdminEnvCheck();

  if (!check.ok) {
    throw new Error(`Missing required admin env: ${check.missing.join(", ")}`);
  }

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string
  };
}

export function getSiteUrl(): string | null {
  return process.env.NEXT_PUBLIC_SITE_URL ?? null;
}
