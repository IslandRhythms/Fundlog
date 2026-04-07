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

/** Bar segment when goal savings cannot map to a savings category (e.g. custom budgets). */
export const GOAL_SAVINGS_SYNTHETIC_CATEGORY_ID = -2;

export type PlannedBarSeg = {
  categoryId: number;
  label: string;
  color: string;
  barWidthPct: number;
  pctOfIncome: number;
  planned: number;
  unexpected: number;
  goalSavings: number;
};

export type PlannedExpenseBarResult = {
  categoryParts: PlannedBarSeg[];
  unallocatedBarPct: number;
  totalPlanned: number;
  totalUnexpected: number;
  totalGoalSavings: number;
  combinedOfIncomePct: number;
};

function goalSavingsParentCategoryId(categories: BudgetCategory[]): number | null {
  const byKey = categories.find((c) => c.ruleKey === 'savingsDebt');
  if (byKey) return byKey.id;
  const byLabel = categories.find((c) => c.label.toLowerCase().includes('savings'));
  return byLabel?.id ?? null;
}

/**
 * One bar segment per top-level category: planned line items + unexpected (manual) expenses
 * mapped via subcategory → parent category, plus goal savings (Record savings) mapped to the
 * savings/debt category when present.
 */
export function computePlannedExpenseBarSegments(
  categories: BudgetCategory[],
  groupedSubcategories: Record<number, BudgetSubcategory[]>,
  subcategories: BudgetSubcategory[],
  unexpectedTxs: Transaction[],
  goalContributionTxs: Transaction[],
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
  const totalGoalSavings = goalContributionTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const savingsCatId = goalSavingsParentCategoryId(categories);

  if (!income || income <= 0) {
    return {
      categoryParts: [],
      unallocatedBarPct: 0,
      totalPlanned,
      totalUnexpected,
      totalGoalSavings,
      combinedOfIncomePct: 0,
    };
  }

  const parts: PlannedBarSeg[] = [];
  for (const cat of categories) {
    const subs = groupedSubcategories[cat.id] ?? [];
    const planned = subs.reduce((sum, sub) => sum + plannedAmountFromSub(sub), 0);
    const unexpected = unexpectedByCategory[cat.id] ?? 0;
    const goalSavings = savingsCatId === cat.id ? totalGoalSavings : 0;
    const total = planned + unexpected + goalSavings;
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
      goalSavings,
    });
  }

  if (totalGoalSavings > 0 && savingsCatId === null) {
    const pctOfIncome = (totalGoalSavings / income) * 100;
    parts.push({
      categoryId: GOAL_SAVINGS_SYNTHETIC_CATEGORY_ID,
      label: 'Goal savings',
      color: '#22c55e',
      barWidthPct: pctOfIncome,
      pctOfIncome,
      planned: 0,
      unexpected: 0,
      goalSavings: totalGoalSavings,
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
  const combined = totalPlanned + totalUnexpected + totalGoalSavings;
  const combinedOfIncomePct = Math.min(100, (combined / income) * 100);

  return {
    categoryParts: parts,
    unallocatedBarPct,
    totalPlanned,
    totalUnexpected,
    totalGoalSavings,
    combinedOfIncomePct,
  };
}
