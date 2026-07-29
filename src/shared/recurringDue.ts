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

/**
 * Next due date on or after `fromDate` (YYYY-MM-DD) for a recurring planned line.
 * Uses dueDay within each active month of the renewing spread cycle.
 */
export function nextDueDateForSub(
  sub: BudgetSubcategory,
  fromDate: string,
): string | null {
  const dueDay = sub.dueDay;
  if (dueDay == null || !Number.isFinite(dueDay)) return null;
  const spread = Math.max(1, sub.spreadMonths ?? 1);
  const startMonth = sub.spreadStartMonth;
  if (spread > 1 && !startMonth) return null;

  const from = fromDate.slice(0, 10);
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
