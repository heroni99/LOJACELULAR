import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
};

const variantAccent = {
  default: "var(--color-primary)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185"
} as const;

export function StatCard({
  label,
  value,
  icon,
  variant = "default"
}: StatCardProps) {
  const accentColor = variantAccent[variant];

  return (
    <div
      className="border border-l-2 p-4"
      style={{
        backgroundColor: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
        borderLeftColor: accentColor,
        borderRadius: "var(--radius-card)"
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[12px] font-medium leading-4"
            style={{ color: "var(--color-text-muted)" }}
          >
            {label}
          </p>
          <div
            className="mt-2 text-[24px] font-semibold leading-7"
            style={{ color: "var(--color-text)" }}
          >
            {value}
          </div>
        </div>

        {icon ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/5"
            style={{ color: accentColor }}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
