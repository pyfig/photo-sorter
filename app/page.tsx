import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { listWorkspacesForUser } from "@/lib/data";

export default async function HomePage() {
  const workspaces = await listWorkspacesForUser();

  return (
    <>
      <PageHeader
        eyebrow="Supabase + Vercel"
        title="Photo Sorter"
        description="Web-first интерфейс для загрузки фото, постановки jobs в очередь и просмотра кластеров лиц. При отсутствии Supabase env страница работает в demo-режиме."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Runtime" value="Next.js on Vercel" />
        <SummaryCard label="Database" value="Supabase Postgres" />
        <SummaryCard label="Storage" value="Supabase Storage" />
        <SummaryCard label="Worker" value="Python + InsightFace" />
      </section>

      {workspaces.length === 0 ? (
        <EmptyState
          title="Workspaces не найдены"
          description="Подключите Supabase env и создайте workspace, либо используйте demo-данные по умолчанию."
        />
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
                  Uploads
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

