import type { ReactNode } from "react";

interface SummaryCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <article className="summary-card">
      <span className="summary-card-label">{label}</span>
      <div className="summary-card-value">{value}</div>
      {hint ? <small className="summary-card-hint">{hint}</small> : null}
    </article>
  );
}
