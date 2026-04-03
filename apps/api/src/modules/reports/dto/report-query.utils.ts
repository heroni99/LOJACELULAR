export function toOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

export const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeFormat = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export const resolveQueryDateAlias =
  (alias: string) =>
  ({
    value,
    obj
  }: {
    value: unknown;
    obj?: Record<string, unknown>;
  }) => {
    const normalizedValue =
      typeof value === "string" ? value.trim() || undefined : value;

    if (normalizedValue !== undefined) {
      return normalizedValue;
    }

    const aliasValue = obj?.[alias];

    return typeof aliasValue === "string" ? aliasValue.trim() || undefined : aliasValue;
  };
