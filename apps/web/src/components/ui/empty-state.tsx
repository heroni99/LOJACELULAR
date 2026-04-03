import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function EmptyState({
  icon,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center border border-dashed px-6 py-10 text-center"
      style={{
        backgroundColor: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-card)"
      }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5"
        style={{ color: "var(--color-text-muted)" }}
      >
        {icon ?? <EmptyStateIcon />}
      </div>
      <h2 className="mt-4 text-base font-semibold" style={{ color: "var(--color-text)" }}>
        {title}
      </h2>
      {description ? (
        <p
          className="mt-2 max-w-md text-sm leading-6"
          style={{ color: "var(--color-text-muted)" }}
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <Button className="mt-5" onClick={action.onClick} type="button" variant="outline">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

function EmptyStateIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="28"
      viewBox="0 0 24 24"
      width="28"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        width="18"
        x="3"
        y="5"
      />
      <path
        d="M7 10h10M7 14h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
