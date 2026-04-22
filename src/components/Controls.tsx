import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`btn btn-${variant} ${className}`} type={type} {...props} />;
}

export function Panel({
  title,
  eyebrow,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { title?: string; eyebrow?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`} {...props}>
      {(title || eyebrow) && (
        <header className="panel-header">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {title && <h2>{title}</h2>}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export function StatusPill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "danger"; children: ReactNode }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
