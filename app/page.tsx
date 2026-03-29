import { redirect } from "next/navigation";
import Link from "next/link";

import { ConfigurationState } from "@/components/configuration-state";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { WorkspaceOnboardingForm } from "@/components/workspace-onboarding-form";
import { getWebEnvCheck, hasRequiredWebEnv } from "@/lib/env";
import { listWorkspacesForUser } from "@/lib/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (!hasRequiredWebEnv()) {
    const check = getWebEnvCheck();

    return (
      <>
        <PageHeader
          eyebrow="Setup"
          title="Supabase configuration required"
          description="Приложение больше не работает в demo-режиме. Для запуска нужны реальные Supabase env."
        />
        <ConfigurationState
          description="Добавьте обязательные env в `.env.local` или в cloud runtime и перезапустите приложение."
          missingKeys={check.missing}
          title="Runtime не настроен"
        />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaces = await listWorkspacesForUser();

  return (
    <>
      <PageHeader
        eyebrow="Supabase + Vercel"
        title="Photo Sorter"
        description="Production-only интерфейс для login, workspace onboarding, upload batches и просмотра результатов кластеризации."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Runtime" value="Next.js on Vercel" />
        <SummaryCard label="Database" value="Supabase Postgres" />
        <SummaryCard label="Storage" value="Supabase Storage" />
        <SummaryCard label="Worker" value="Python + InsightFace" />
      </section>

      {workspaces.length === 0 ? (
        <section className="grid">
          <EmptyState
            title="Workspaces пока нет"
            description="Создайте первый workspace, чтобы загружать фото и запускать processing jobs."
          />
          <WorkspaceOnboardingForm />
        </section>
      ) : (
        <section className="grid">
          {workspaces.map((workspace) => (
            <article className="workspace-card" key={workspace.id}>
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>{workspace.name}</h2>
              </div>
              <div className="workspace-meta">
                <span>slug: {workspace.slug}</span>
                <span>role: {workspace.role}</span>
                <span>photos: {workspace.totalPhotos}</span>
                <span>active jobs: {workspace.activeJobs}</span>
                <span>clusters: {workspace.clustersCount}</span>
              </div>
              <div className="actions">
                <Link className="button" href={`/workspaces/${workspace.id}`}>
                  Открыть workspace
                </Link>
                <Link className="button-secondary" href={`/workspaces/${workspace.id}/uploads`}>
                  Uploads & Jobs
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
