import Link from "next/link";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref,
  backLabel = "Назад"
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {backHref ? (
        <Link className="back-link" href={backHref}>
          {backLabel}
        </Link>
      ) : null}
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div aria-hidden="true" className="page-header-visual">
        <span className="page-header-sun" />
        <span className="page-header-wave page-header-wave-one" />
        <span className="page-header-wave page-header-wave-two" />
        <div className="page-header-seeds">
          <span />
          <span />
          <span />
        </div>
      </div>
    </header>
  );
}
