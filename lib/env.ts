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

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
} as const;

const adminEnv = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
} as const;

export function getWebEnvCheck(): RuntimeCheck {
  const missing = requiredWebEnvKeys.filter((key) => !publicEnv[key]);
  return {
    ok: missing.length === 0,
    missing
  };
}

export function getAdminEnvCheck(): RuntimeCheck {
  const missing = requiredAdminEnvKeys.filter((key) => {
    if (key === "NEXT_PUBLIC_SUPABASE_URL") {
      return !publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    }

    return !adminEnv.SUPABASE_SERVICE_ROLE_KEY;
  });

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
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseAnonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  };
}

export function getRequiredAdminEnv() {
  const check = getAdminEnvCheck();

  if (!check.ok) {
    throw new Error(`Missing required admin env: ${check.missing.join(", ")}`);
  }

  return {
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseServiceRoleKey: adminEnv.SUPABASE_SERVICE_ROLE_KEY as string
  };
}

export function getSiteUrl(): string | null {
  return publicEnv.NEXT_PUBLIC_SITE_URL ?? null;
}
