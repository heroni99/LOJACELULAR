export function formatCurrency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format((valueInCents ?? 0) / 100);
}

export function formatCurrencyInput(valueInCents: number) {
  return formatCurrency(valueInCents ?? 0);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function centsToInputValue(valueInCents: number) {
  return ((valueInCents ?? 0) / 100).toFixed(2);
}

export function parseCurrencyToCents(value: string) {
  const compact = value.replace(/\s/g, "").replace(/^R\$/, "").trim();

  let normalized = compact;

  if (compact.includes(",")) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if ((compact.match(/\./g) ?? []).length > 1) {
    normalized = compact.replace(/\./g, "");
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function formatCurrencyInputFromDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  const cents = digits ? Number(digits) : 0;

  return formatCurrencyInput(cents);
}

export function parseInteger(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}
