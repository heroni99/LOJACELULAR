import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions
}: PageHeaderProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-white/90">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">{title}</h1>
              {badge}
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
