interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <span className="eyebrow">Спокойная зона</span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
    </section>
  );
}
