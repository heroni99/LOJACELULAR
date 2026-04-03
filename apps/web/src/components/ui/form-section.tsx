import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormSectionProps = {
  title: string;
  columns?: 1 | 2;
  children: ReactNode;
  className?: string;
};

export function FormSection({
  title,
  columns = 2,
  children,
  className
}: FormSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <p
          className="text-[13px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {title}
        </p>
        <div className="h-px w-full bg-white/10" />
      </div>

      <div className={cn("grid gap-4", columns === 2 ? "md:grid-cols-2" : undefined)}>
        {children}
      </div>
    </section>
  );
}
