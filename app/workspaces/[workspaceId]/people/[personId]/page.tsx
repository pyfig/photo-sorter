import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PersonPhotoGallery } from "@/components/person-photo-gallery";
import { SummaryCard } from "@/components/summary-card";
import { getPersonDetails } from "@/lib/data";
import { shortId } from "@/lib/utils";

export default async function PersonPage({
  params
}: {
  params: Promise<{ workspaceId: string; personId: string }>;
}) {
  const { workspaceId, personId } = await params;
  const person = await getPersonDetails(workspaceId, personId);

  if (!person) {
    notFound();
  }

  return (
    <>
      <PageHeader
        backHref={`/workspaces/${workspaceId}`}
        backLabel="К проекту"
        eyebrow="Результат"
        title={person.displayName}
        description="Здесь собраны фотографии, которые сервис отнёс к одному и тому же человеку, чтобы итог сортировки можно было проверить в одном месте."
      />

      <section className="grid cards" style={{ marginBottom: 24 }}>
        <SummaryCard label="Фото в группе" value={person.photoCount} hint="Сколько кадров сервис связал с этим человеком" />
        <SummaryCard
          label="Лучшее превью"
          value={person.previewUrl ? "Готово" : "Готовится"}
          hint="Лучший кадр для быстрого просмотра результата"
        />
        <SummaryCard label="Номер результата" value={shortId(person.id)} hint="Короткий идентификатор группы внутри проекта" />
      </section>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Лучшее превью</h2>
        <div className="preview-box">
          {person.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={person.displayName} className="preview-image" src={person.previewUrl} />
          ) : (
            "Превью появится после завершения обработки."
          )}
        </div>
      </section>

      <section className="grid">
        <div className="section-heading">
          <h2>Все фотографии в этой группе</h2>
          <span className="muted">
            Карточки ниже показывают рамку детектированного лица и confidence детектора в процентах
          </span>
        </div>

        {person.photos.length === 0 ? (
          <EmptyState
            title="Фотографий пока нет"
            description="Когда сервис привяжет фотографии к этой группе, они появятся здесь."
          />
        ) : (
          <PersonPhotoGallery photos={person.photos} />
        )}
      </section>
    </>
  );
}
