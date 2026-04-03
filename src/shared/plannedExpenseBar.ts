import type { BudgetCategory, BudgetSubcategory, Transaction } from './types';

export function plannedAmountFromSub(sub: BudgetSubcategory): number {
  if (!sub.isFlexible && sub.targetAmount != null) {
    return sub.targetAmount;
  }
  if (sub.isFlexible && (sub.maxAmount != null || sub.minAmount != null)) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    return (min + max) / 2;
  }
  return 0;
}

export type PlannedBarSeg = {
  categoryId: number;
  label: string;
  color: string;
  barWidthPct: number;
  pctOfIncome: number;
  planned: number;
  unexpected: number;
};

export type PlannedExpenseBarResult = {
  categoryParts: PlannedBarSeg[];
  unallocatedBarPct: number;
  totalPlanned: number;
  totalUnexpected: number;
  combinedOfIncomePct: number;
};

/**
 * One bar segment per top-level category: planned line items + unexpected (manual) expenses
 * mapped via subcategory → parent category. Bar width is share of monthly income.
 */
export function computePlannedExpenseBarSegments(
  categories: BudgetCategory[],
  groupedSubcategories: Record<number, BudgetSubcategory[]>,
  subcategories: BudgetSubcategory[],
  unexpectedTxs: Transaction[],
  income: number,
): PlannedExpenseBarResult {
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const unexpectedByCategory: Record<number, number> = {};
  for (const tx of unexpectedTxs) {
    if (tx.subcategoryId == null) continue;
    const sub = subById.get(tx.subcategoryId);
    const pid = sub?.parentCategoryId;
    if (pid == null) continue;
    unexpectedByCategory[pid] = (unexpectedByCategory[pid] ?? 0) + tx.amount;
  }

  const totalPlanned = subcategories.reduce(
    (sum, sub) => sum + plannedAmountFromSub(sub),
    0,
  );
  const totalUnexpected = unexpectedTxs.reduce((sum, tx) => sum + tx.amount, 0);

  if (!income || income <= 0) {
    return {
      categoryParts: [],
      unallocatedBarPct: 0,
      totalPlanned,
      totalUnexpected,
      combinedOfIncomePct: 0,
    };
  }

  const parts: PlannedBarSeg[] = [];
  for (const cat of categories) {
    const subs = groupedSubcategories[cat.id] ?? [];
    const planned = subs.reduce((sum, sub) => sum + plannedAmountFromSub(sub), 0);
    const unexpected = unexpectedByCategory[cat.id] ?? 0;
    const total = planned + unexpected;
    if (total <= 0) continue;
    const pctOfIncome = (total / income) * 100;
    parts.push({
      categoryId: cat.id,
      label: cat.label,
      color: cat.color,
      barWidthPct: pctOfIncome,
      pctOfIncome,
      planned,
      unexpected,
    });
  }

  let used = parts.reduce((s, p) => s + p.barWidthPct, 0);
  if (used > 100.001) {
    const scale = 100 / used;
    for (const p of parts) {
      p.barWidthPct *= scale;
    }
    used = 100;
  }
  const unallocatedBarPct = Math.max(0, 100 - used);
  const combined = totalPlanned + totalUnexpected;
  const combinedOfIncomePct = Math.min(100, (combined / income) * 100);

  return {
    categoryParts: parts,
    unallocatedBarPct,
    totalPlanned,
    totalUnexpected,
    combinedOfIncomePct,
  };
}
