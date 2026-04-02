export function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartDateValue() {
  const date = new Date();
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

export function shortDateLabel(value: string) {
  return value.slice(5);
}
