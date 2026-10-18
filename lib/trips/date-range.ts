/** Calendar-only dates use UTC arithmetic, independently of browser timezone and DST. */
export function tripEndDate(start: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(days) || days < 1 || days > 21) return null;
  const date = new Date(`${start}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return null;
  date.setUTCDate(date.getUTCDate() + days - 1);
  const end = date.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
}

export function formatTripDate(date: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
}
