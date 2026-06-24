import { isValidCalendarMonth } from './calendarMonth';

export function parseCalendarMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m };
}

export function addCalendarMonths(ym: string, delta: number): string {
  const { year, month } = parseCalendarMonth(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function calendarMonthFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** True when `viewingMonth` falls in [startMonth, startMonth + spreadMonths). */
export function isMonthInSpreadRange(
  startMonth: string,
  spreadMonths: number,
  viewingMonth: string,
): boolean {
  if (!isValidCalendarMonth(startMonth) || !isValidCalendarMonth(viewingMonth)) return false;
  const spread = Math.max(1, Math.floor(spreadMonths));
  if (spread <= 1) return startMonth === viewingMonth;
  const startIdx = monthIndex(startMonth);
  const viewIdx = monthIndex(viewingMonth);
  return viewIdx >= startIdx && viewIdx < startIdx + spread;
}

function monthIndex(ym: string): number {
  const { year, month } = parseCalendarMonth(ym);
  return year * 12 + (month - 1);
}

export function monthlyPortion(total: number, spreadMonths: number): number {
  const spread = Math.max(1, Math.floor(spreadMonths));
  return total / spread;
}

export function spreadMonthsLabel(spreadMonths: number): string {
  const spread = Math.max(1, Math.floor(spreadMonths));
  return spread === 1 ? '1 month' : `${spread} months`;
}
