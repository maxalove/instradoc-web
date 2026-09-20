import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

/**
 * The single button primitive. Variants map to `.btn-*` in app.css; combine with the
 * `btn-sm` / `btn-icon` modifiers via `className` for compact and icon-only buttons.
 */
export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`btn btn-${variant} ${className}`.trim()} type={type} {...props} />;
}
