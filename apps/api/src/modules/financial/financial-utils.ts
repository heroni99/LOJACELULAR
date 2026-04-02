import { FinancialEntryStatus } from "@prisma/client";

export function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

export function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function isPendingFinancialStatus(status: FinancialEntryStatus) {
  return status === FinancialEntryStatus.PENDING || status === FinancialEntryStatus.OVERDUE;
}

export function resolveFinancialStatusForDueDate(
  status: FinancialEntryStatus,
  dueDate: Date
) {
  if (!isPendingFinancialStatus(status)) {
    return status;
  }

  return dueDate < getTodayStart()
    ? FinancialEntryStatus.OVERDUE
    : FinancialEntryStatus.PENDING;
}

export function calculateDaysUntilDue(dueDate: Date) {
  const diff = dueDate.getTime() - getTodayStart().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function buildPeriodRange(period: "today" | "week" | "month") {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  const days = period === "today" ? 0 : period === "week" ? 6 : 29;
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

export function formatSeriesDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
