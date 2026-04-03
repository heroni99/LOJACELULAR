import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DetailCardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function DetailCard({ title, children, className }: DetailCardProps) {
  return (
    <section
      className={cn("border p-6", className)}
      style={{
        backgroundColor: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
        borderRadius: "var(--radius-card)"
      }}
    >
      {title ? (
        <h2 className="mb-4 text-base font-semibold" style={{ color: "var(--color-text)" }}>
          {title}
        </h2>
      ) : null}
      <div>{children}</div>
    </section>
  );
}
