/**
 * Day-precision date math for warranty clocks.
 *
 * Everything here operates on `YYYY-MM-DD` strings anchored to UTC noon. That
 * anchor matters: warranty boundaries decide whether a builder pays for a
 * repair, and a naive `new Date("2026-03-14")` in a US timezone lands on the
 * 13th locally. An off-by-one here is a real dollar error, so we never let
 * local time near this math.
 */

export type IsoDate = string; // YYYY-MM-DD

const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: string): value is IsoDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse a date-only string to a UTC-noon Date. Throws on malformed input. */
export function parseIsoDate(date: IsoDate): Date {
  if (!isIsoDate(date)) {
    throw new Error(`invalid ISO date: ${date}`);
  }
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid ISO date: ${date}`);
  }
  return parsed;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}

export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(date).getTime() + days * DAY_MS));
}

/**
 * Add calendar months, clamping to the end of the target month.
 * Jan 31 + 1 month = Feb 28 (or 29), which is how warranty terms are read —
 * "twelve months from closing", not "365 days from closing".
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const targetMonth = d.getUTCMonth() + months;
  const candidate = new Date(
    Date.UTC(d.getUTCFullYear(), targetMonth, 1, 12, 0, 0, 0),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  candidate.setUTCDate(Math.min(d.getUTCDate(), daysInTargetMonth));
  return toIsoDate(candidate);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS,
  );
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return parseIsoDate(a).getTime() < parseIsoDate(b).getTime();
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return parseIsoDate(a).getTime() > parseIsoDate(b).getTime();
}

/** Inclusive on both ends — the last day of coverage is still covered. */
export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  const t = parseIsoDate(date).getTime();
  return t >= parseIsoDate(start).getTime() && t <= parseIsoDate(end).getTime();
}

export function minDate(...dates: IsoDate[]): IsoDate | null {
  if (dates.length === 0) return null;
  return dates.reduce((acc, d) => (isBefore(d, acc) ? d : acc));
}

export function maxDate(...dates: IsoDate[]): IsoDate | null {
  if (dates.length === 0) return null;
  return dates.reduce((acc, d) => (isAfter(d, acc) ? d : acc));
}
