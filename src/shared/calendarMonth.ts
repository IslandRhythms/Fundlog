/** Local calendar month as `YYYY-MM`. */
export function calendarMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Local calendar day as `YYYY-MM-DD` (not UTC). */
export function localDateIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isValidCalendarMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s.trim());
}
