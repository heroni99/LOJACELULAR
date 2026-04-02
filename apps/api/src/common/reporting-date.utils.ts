export type ReportingPeriod = "today" | "week" | "month";

type ZonedDateInput = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

export function toSafeNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return value ?? 0;
}

export function formatDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")),
    minute: Number(map.get("minute")),
    second: Number(map.get("second"))
  };
}

export function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = formatDateParts(date, timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function zonedDateTimeToUtc(input: ZonedDateInput, timeZone: string) {
  let utcDate = new Date(
    Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour ?? 0,
      input.minute ?? 0,
      input.second ?? 0,
      input.millisecond ?? 0
    )
  );

  for (let index = 0; index < 3; index += 1) {
    const actual = formatDateParts(utcDate, timeZone);
    const expectedTimestamp = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour ?? 0,
      input.minute ?? 0,
      input.second ?? 0,
      0
    );
    const actualTimestamp = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );

    if (actualTimestamp === expectedTimestamp) {
      break;
    }

    utcDate = new Date(utcDate.getTime() + (expectedTimestamp - actualTimestamp));
  }

  return utcDate;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildRelativeRange(period: ReportingPeriod, timeZone: string) {
  const now = new Date();
  const nowParts = formatDateParts(now, timeZone);
  const startOfToday = zonedDateTimeToUtc(
    {
      year: nowParts.year,
      month: nowParts.month,
      day: nowParts.day
    },
    timeZone
  );
  const endExclusive = addDays(startOfToday, 1);

  if (period === "today") {
    return {
      start: startOfToday,
      endExclusive,
      timeZone
    };
  }

  return {
    start: addDays(startOfToday, period === "week" ? -6 : -29),
    endExclusive,
    timeZone
  };
}

export function parseDateOnlyInTimeZone(
  value: string,
  timeZone: string,
  endOfDay = false
) {
  const [year, month, day] = value.split("-").map(Number);

  return zonedDateTimeToUtc(
    {
      year,
      month,
      day,
      hour: endOfDay ? 23 : 0,
      minute: endOfDay ? 59 : 0,
      second: endOfDay ? 59 : 0,
      millisecond: endOfDay ? 999 : 0
    },
    timeZone
  );
}

export function buildDateKeysBetween(
  start: Date,
  endExclusive: Date,
  timeZone: string
) {
  const keys: string[] = [];
  let cursor = new Date(start);

  while (cursor < endExclusive) {
    keys.push(formatDateInTimeZone(cursor, timeZone));
    cursor = addDays(cursor, 1);
  }

  return keys;
}
