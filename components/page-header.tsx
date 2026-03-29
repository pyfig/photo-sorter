import Link from "next/link";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  backHref?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref
}: PageHeaderProps) {
  return (
    <header className="page-header">
      {backHref ? (
        <Link className="back-link" href={backHref}>
          Назад
        </Link>
      ) : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

