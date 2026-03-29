import { redirect } from "next/navigation";

import { ConfigurationState } from "@/components/configuration-state";
import { LoginForm } from "@/components/login-form";
import { PageHeader } from "@/components/page-header";
import { getWebEnvCheck, hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  if (!hasRequiredWebEnv()) {
    const check = getWebEnvCheck();

    return (
      <>
        <PageHeader
          eyebrow="Setup"
          title="Supabase configuration required"
          description="Login flow зависит от реального Supabase Auth и больше не имеет заглушки."
        />
        <ConfigurationState
          description="Настройте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`, затем повторите вход."
          missingKeys={check.missing}
          title="Auth runtime не настроен"
        />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <>
      <PageHeader
        eyebrow="Auth"
        title="Login"
        description="Вход по email magic link через Supabase Auth. После логина пользователь попадает в dashboard или onboarding workspace."
      />
      <LoginForm message={params.message} nextPath={params.next} />
    </>
  );
}
