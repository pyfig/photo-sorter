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
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="panel-inline">
        <strong>Missing env</strong>
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
