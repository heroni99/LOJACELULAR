import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { DownloadedFile } from "@/lib/api";

export const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function downloadBrowserFile(file: DownloadedFile) {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportMetricCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function SingleSeriesBarChart({
  entries,
  colorClassName,
  emptyMessage,
  formatValue = formatCurrency
}: {
  entries: Array<{ label: string; value: number }>;
  colorClassName: string;
  emptyMessage: string;
  formatValue?(value: number): string;
}) {
  if (!entries.length) {
    return <EmptyChart message={emptyMessage} />;
  }

  const max = Math.max(1, ...entries.map((entry) => Math.abs(entry.value)));

  return (
    <div className="space-y-4">
      <div className="flex h-56 items-end gap-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`w-full rounded-t-lg ${colorClassName}`}
              style={{ height: `${Math.max(6, (Math.abs(entry.value) / max) * 100)}%` }}
              title={formatValue(entry.value)}
            />
            <span className="text-[11px] text-muted-foreground">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DualSeriesBarChart({
  entries,
  firstColorClassName,
  firstLabel,
  secondColorClassName,
  secondLabel,
  emptyMessage,
  formatValue = formatCurrency
}: {
  entries: Array<{
    label: string;
    firstValue: number;
    secondValue: number;
  }>;
  firstColorClassName: string;
  firstLabel: string;
  secondColorClassName: string;
  secondLabel: string;
  emptyMessage: string;
  formatValue?(value: number): string;
}) {
  if (!entries.length) {
    return <EmptyChart message={emptyMessage} />;
  }

  const max = Math.max(
    1,
    ...entries.flatMap((entry) => [Math.abs(entry.firstValue), Math.abs(entry.secondValue)])
  );

  return (
    <div className="space-y-4">
      <div className="flex h-56 items-end gap-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className={`w-1/2 rounded-t-lg ${firstColorClassName}`}
                style={{ height: `${Math.max(6, (Math.abs(entry.firstValue) / max) * 100)}%` }}
                title={`${firstLabel} ${formatValue(entry.firstValue)}`}
              />
              <div
                className={`w-1/2 rounded-t-lg ${secondColorClassName}`}
                style={{ height: `${Math.max(6, (Math.abs(entry.secondValue) / max) * 100)}%` }}
                title={`${secondLabel} ${formatValue(entry.secondValue)}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{entry.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${firstColorClassName}`} />
          {firstLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${secondColorClassName}`} />
          {secondLabel}
        </span>
      </div>
    </div>
  );
}
