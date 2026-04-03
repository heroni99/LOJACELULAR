import { parseApiError } from "@/lib/api-error";

export const COMMISSION_MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Marco" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
] as const;

export function getCurrentCommissionPeriod() {
  const now = new Date();

  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  }).format(value ?? 0)}%`;
}

export function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
