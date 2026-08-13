import type { BudgetSubcategory } from './types';
import {
  addCalendarMonths,
  isMonthInRecurringSpread,
  parseCalendarMonth,
} from './monthSpread';
import { isValidCalendarMonth } from './calendarMonth';
import { plannedAmountFromSub, plannedTotalFromSub } from './plannedExpenseBar';

export type UpcomingDue = {
  subcategoryId: number;
  label: string;
  amount: number;
  monthlyAmount: number;
  dueDate: string; // YYYY-MM-DD
  daysUntil: number;
};

function clampDueDay(dueDay: number, year: number, month: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, Math.floor(dueDay)), lastDay);
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

/** Advance a YYYY-MM-DD by `delta` calendar months, clamping the day. */
export function addMonthsToIsoDate(iso: string, delta: number): string {
  const raw = iso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const anchor = new Date(year, month - 1 + delta, 1);
  const y = anchor.getFullYear();
  const mo = anchor.getMonth() + 1;
  return isoDate(y, mo, clampDueDay(day, y, mo));
}

/**
 * Next due date on or after `fromDate` (YYYY-MM-DD) for a recurring planned line.
 * Prefers an explicit `nextDueDate` (rolling forward by spreadMonths after it passes);
 * otherwise uses dueDay within each active month of the renewing spread cycle.
 */
export function nextDueDateForSub(
  sub: BudgetSubcategory,
  fromDate: string,
): string | null {
  const from = fromDate.slice(0, 10);
  if (!isValidIsoDate(from)) return null;

  const anchored = sub.nextDueDate?.trim().slice(0, 10) ?? null;
  if (anchored && isValidIsoDate(anchored)) {
    const interval = Math.max(1, sub.spreadMonths ?? 1);
    let d = anchored;
    for (let i = 0; i < 120 && d < from; i++) {
      d = addMonthsToIsoDate(d, interval);
    }
    return d >= from ? d : null;
  }

  const dueDay = sub.dueDay;
  if (dueDay == null || !Number.isFinite(dueDay)) return null;
  const spread = Math.max(1, sub.spreadMonths ?? 1);
  const startMonth = sub.spreadStartMonth;
  if (spread > 1 && !startMonth) return null;

  let month = from.slice(0, 7);
  if (!isValidCalendarMonth(month)) return null;

  for (let i = 0; i < 36; i++) {
    if (spread > 1 && startMonth) {
      if (!isMonthInRecurringSpread(startMonth, spread, month)) {
        month = addCalendarMonths(month, 1);
        continue;
      }
    } else if (spread <= 1 && startMonth && month < startMonth) {
      month = addCalendarMonths(month, 1);
      continue;
    }

    const { year, month: mo } = parseCalendarMonth(month);
    const day = clampDueDay(dueDay, year, mo);
    const candidate = isoDate(year, mo, day);
    if (candidate >= from) return candidate;
    month = addCalendarMonths(month, 1);
  }
  return null;
}

export function upcomingDuesFromSubs(
  subs: BudgetSubcategory[],
  fromDate: string,
  withinDays: number,
  viewingMonth: string,
): UpcomingDue[] {
  const from = fromDate.slice(0, 10);
  const fromMs = Date.parse(`${from}T12:00:00`);
  if (!Number.isFinite(fromMs)) return [];

  const results: UpcomingDue[] = [];
  for (const sub of subs) {
    if (sub.isFlexible) continue;
    if (plannedTotalFromSub(sub) <= 0) continue;
    const dueDate = nextDueDateForSub(sub, from);
    if (!dueDate) continue;
    const dueMs = Date.parse(`${dueDate}T12:00:00`);
    const daysUntil = Math.round((dueMs - fromMs) / (24 * 60 * 60 * 1000));
    if (daysUntil < 0 || daysUntil > withinDays) continue;
    results.push({
      subcategoryId: sub.id,
      label: sub.label,
      amount: plannedTotalFromSub(sub),
      monthlyAmount: plannedAmountFromSub(sub, viewingMonth),
      dueDate,
      daysUntil,
    });
  }
  return results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
