interface ConfigurationStateProps {
  title: string;
  description: string;
  missingKeys: string[];
}

export function ConfigurationState({
  title,
  description,
  missingKeys
}: ConfigurationStateProps) {
  return (
    <section className="empty-state">
      <span className="eyebrow">Настройка</span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <div className="panel-inline">
        <strong>Что нужно настроить</strong>
        <ul className="code-list">
          {missingKeys.map((key) => (
            <li key={key}>
              <code>{key}</code>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
