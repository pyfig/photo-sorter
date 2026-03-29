import { PageHeader } from "@/components/page-header";
import { SummaryCard } from "@/components/summary-card";
import { getPersonDetails } from "@/lib/data";

export default async function PersonPage({
  params
}: {
  params: Promise<{ workspaceId: string; personId: string }>;
}) {
  const { workspaceId, personId } = await params;
  const person = await getPersonDetails(workspaceId, personId);

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        eyebrow="Person cluster"
        title={person.displayName}
        description="Просмотр одного кластера человека и связанных с ним фотографий."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Cluster ID" value={person.id} />
        <SummaryCard label="Photos" value={person.photoCount} />
        <SummaryCard label="Workspace" value={person.workspaceId} />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Preview</h2>
        <div className="preview-box">
          {person.previewPath ? person.previewPath : "Preview будет доступен после worker run"}
        </div>
      </section>

      <section className="photo-grid">
        {person.photos.map((photo) => (
          <article className="photo-card" key={photo.id}>
            <strong>{photo.id}</strong>
            <p className="muted">{photo.storagePath}</p>
          </article>
        ))}
      </section>
    </>
  );
}

