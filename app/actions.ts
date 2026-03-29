"use server";

import { redirect } from "next/navigation";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export async function createWorkspaceAction(
  _previousState: { error: string | null },
  formData: FormData
) {
  if (!hasRequiredWebEnv()) {
    return {
      error: "Supabase env не настроены. Workspace onboarding недоступен."
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugInput || name);

  if (name.length < 3) {
    return {
      error: "Название workspace должно содержать минимум 3 символа."
    };
  }

  if (!slug) {
    return {
      error: "Не удалось построить slug. Используйте латиницу, цифры или дефис."
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("bootstrap_workspace", {
    workspace_name: name,
    workspace_slug: slug
  });

  if (error) {
    return {
      error: error.message
    };
  }

  const workspace =
    Array.isArray(data) ? (data[0] as { id: string } | undefined) : (data as { id: string });

  if (!workspace?.id) {
    return {
      error: "Supabase не вернул созданный workspace."
    };
  }

  redirect(`/workspaces/${workspace.id}`);
}

export async function signOutAction() {
  if (!hasRequiredWebEnv()) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
