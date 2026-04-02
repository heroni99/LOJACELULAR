import type { ReactNode } from "react";

type StatusTone = "green" | "amber" | "orange" | "slate" | "blue";

export function StatusBadge({
  tone,
  children
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  const className =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "orange"
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : tone === "blue"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}
