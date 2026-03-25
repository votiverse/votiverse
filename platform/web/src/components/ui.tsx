/** Shared UI primitives. */

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`bg-surface-raised rounded-2xl border border-border-default shadow-sm ${className}`} onClick={onClick} role={onClick ? "button" : undefined}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-3 sm:px-6 sm:py-4 border-b border-border-subtle ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 py-3 sm:px-6 sm:py-4 ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const base = "inline-flex items-center justify-center font-medium rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]";
  const variants = {
    primary: "bg-accent text-text-on-accent hover:bg-accent-hover focus:ring-focus-ring active:bg-accent-active",
    secondary: "bg-surface-raised text-text-secondary border border-border-strong hover:bg-interactive-hover focus:ring-focus-ring active:bg-interactive-active",
    danger: "bg-error text-text-on-accent hover:bg-error-hover focus:ring-error active:bg-error-active",
    ghost: "text-text-secondary hover:text-text-primary hover:bg-interactive-active focus:ring-focus-ring active:bg-surface-sunken",
  };
  const sizes = {
    sm: "px-3 py-2 text-sm min-h-[36px] sm:min-h-0 sm:py-1.5",
    md: "px-4 py-2.5 text-sm min-h-[44px] sm:min-h-0 sm:py-2",
    lg: "px-6 py-3 text-base min-h-[48px]",
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`block w-full rounded-xl border border-border-strong bg-surface-raised px-3 py-2.5 text-base sm:text-sm shadow-sm placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-focus-ring min-h-[44px] sm:min-h-0 sm:py-2 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`block w-full rounded-xl border border-border-strong bg-surface-raised px-3 py-2.5 text-base sm:text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-focus-ring min-h-[44px] sm:min-h-0 sm:py-2 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-text-secondary mb-1 ${className}`}>{children}</label>;
}

export function Badge({ children, color = "gray" }: { children: ReactNode; color?: "gray" | "green" | "blue" | "yellow" | "red" }) {
  const colors = {
    gray: "bg-badge-gray-bg text-badge-gray-text",
    green: "bg-badge-green-bg text-badge-green-text",
    blue: "bg-badge-blue-bg text-badge-blue-text",
    yellow: "bg-badge-yellow-bg text-badge-yellow-text",
    red: "bg-badge-red-bg text-badge-red-text",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border-default border-t-accent" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-error-subtle border border-error-border p-4">
      <p className="text-sm text-error-text">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-sm text-error underline hover:text-error-hover min-h-[44px] sm:min-h-0">
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function BadgeDot({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-notification-dot text-text-on-accent text-[10px] font-bold leading-none ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-skeleton rounded ${className}`} />;
}

/** CSS-only tooltip using Tailwind group hover. Wraps children and shows text on hover. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 text-xs text-[var(--tooltip-text)] bg-[var(--tooltip-bg)] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--tooltip-bg)]" />
      </span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { color: "green" | "blue" | "yellow" | "gray" | "red"; key: string }> = {
    active: { color: "green", key: "status.active" },
    voting: { color: "green", key: "status.voting" },
    curation: { color: "yellow", key: "status.curation" },
    deliberation: { color: "blue", key: "status.deliberation" },
    upcoming: { color: "yellow", key: "status.upcoming" },
    closed: { color: "gray", key: "status.closed" },
    open: { color: "green", key: "status.open" },
    scheduled: { color: "yellow", key: "status.scheduled" },
  };
  const entry = map[status] ?? { color: "gray" as const, key: status };
  return <Badge color={entry.color}>{t(entry.key)}</Badge>;
}
