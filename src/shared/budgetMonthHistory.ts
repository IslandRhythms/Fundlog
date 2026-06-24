import type { Budget, BudgetSubcategory, Transaction } from './types';
import { calendarMonthNow } from './calendarMonth';
import { addCalendarMonths } from './monthSpread';
import {
  plannedAmountFromSub,
  transactionMonthlyImpact,
} from './plannedExpenseBar';

export type BudgetMonthPerformance = {
  month: string;
  income: number;
  planned: number;
  purchases: number;
  unexpected: number;
  goalSavings: number;
  committed: number;
  moneyLeft: number;
  usedPct: number;
  isOverCommitted: boolean;
};

/** Inclusive month range from `startMonth` through `endMonth`. */
export function monthsBetween(startMonth: string, endMonth: string): string[] {
  if (endMonth < startMonth) return [];
  const months: string[] = [];
  let cur = startMonth;
  while (cur <= endMonth) {
    months.push(cur);
    cur = addCalendarMonths(cur, 1);
  }
  return months;
}

/** Completed calendar months for a budget (excludes the current in-progress month). */
export function historicalMonthsForBudget(budget: Budget, nowMonth = calendarMonthNow()): string[] {
  const lastCompleted = addCalendarMonths(nowMonth, -1);
  if (lastCompleted < budget.startMonth) return [];

  let endMonth = lastCompleted;
  if (budget.endMonth && budget.endMonth < endMonth) {
    endMonth = budget.endMonth;
  }
  if (endMonth < budget.startMonth) return [];

  return monthsBetween(budget.startMonth, endMonth);
}

export function formatCalendarMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function computeBudgetMonthPerformance(
  month: string,
  subcategories: BudgetSubcategory[],
  unexpectedTxs: Transaction[],
  purchaseTxs: Transaction[],
  goalTxs: Transaction[],
  effectiveIncome: number,
): BudgetMonthPerformance {
  const planned = subcategories.reduce(
    (sum, sub) => sum + plannedAmountFromSub(sub, month),
    0,
  );
  const purchases = purchaseTxs.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, month),
    0,
  );
  const unexpected = unexpectedTxs.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, month),
    0,
  );
  const goalSavings = goalTxs.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, month),
    0,
  );
  const committed = planned + purchases + unexpected + goalSavings;
  const moneyLeft = effectiveIncome - committed;
  const usedPct =
    effectiveIncome > 0 ? Math.min(100, (committed / effectiveIncome) * 100) : 0;

  return {
    month,
    income: effectiveIncome,
    planned,
    purchases,
    unexpected,
    goalSavings,
    committed,
    moneyLeft,
    usedPct,
    isOverCommitted: effectiveIncome > 0 && committed > effectiveIncome,
  };
}
