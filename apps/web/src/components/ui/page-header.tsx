import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  leadingVisual?: ReactNode;
  titleAdornment?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  leadingVisual,
  titleAdornment,
  actions
}: PageHeaderProps) {
  return (
    <div
      className="flex flex-col gap-4 border px-6 py-5 md:flex-row md:items-center md:justify-between"
      style={{
        backgroundColor: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-card)"
      }}
      >
      <div className="flex min-w-0 items-start gap-3">
        {backHref ? (
          <Link
            aria-label="Voltar"
            className={cn(
              "inline-flex shrink-0 items-center justify-center border text-base transition-colors",
              backLabel ? "h-9 gap-2 px-3 text-sm font-medium" : "h-9 w-9",
              "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            style={{
              color: "var(--color-text)",
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-input)"
            }}
            to={backHref}
          >
            <span aria-hidden="true">←</span>
            {backLabel ? <span>{backLabel}</span> : null}
          </Link>
        ) : null}

        {leadingVisual ? <div className="shrink-0">{leadingVisual}</div> : null}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="truncate text-[18px] font-semibold leading-6"
              style={{ color: "var(--color-text)" }}
            >
              {title}
            </h1>
            {titleAdornment}
          </div>
          {subtitle ? (
            <p
              className="mt-1 text-[13px] leading-5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
