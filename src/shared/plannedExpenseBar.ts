import type { BudgetCategory, BudgetSubcategory, Transaction } from './types';
import { FUND_COLORS } from './fundColors';
import {
  calendarMonthFromDate,
  isMonthInSpreadRange,
  monthlyPortion,
} from './monthSpread';

export function plannedAmountFromSub(
  sub: BudgetSubcategory,
  viewingMonth?: string,
): number {
  const spread = Math.max(1, sub.spreadMonths ?? 1);
  const startMonth = sub.spreadStartMonth ?? null;

  if (viewingMonth && spread > 1 && startMonth) {
    if (!isMonthInSpreadRange(startMonth, spread, viewingMonth)) return 0;
  }

  let base = 0;
  if (!sub.isFlexible && sub.targetAmount != null) {
    base = sub.targetAmount;
  } else if (sub.isFlexible && (sub.maxAmount != null || sub.minAmount != null)) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    base = (min + max) / 2;
  }

  if (base <= 0) return 0;
  return monthlyPortion(base, spread);
}

/** Full total before spreading (for display). */
export function plannedTotalFromSub(sub: BudgetSubcategory): number {
  if (!sub.isFlexible && sub.targetAmount != null) return sub.targetAmount;
  if (sub.isFlexible && (sub.maxAmount != null || sub.minAmount != null)) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    return (min + max) / 2;
  }
  return 0;
}

export function transactionMonthlyImpact(
  tx: Transaction,
  viewingMonth: string,
): number {
  const spread = Math.max(1, tx.spreadMonths ?? 1);
  const startMonth = calendarMonthFromDate(tx.date);
  if (!isMonthInSpreadRange(startMonth, spread, viewingMonth)) return 0;
  return monthlyPortion(tx.amount, spread);
}

export function purchasesForSub(
  subId: number,
  purchaseTxs: Transaction[],
  viewingMonth: string,
): number {
  return purchaseTxs
    .filter((tx) => tx.subcategoryId === subId)
    .reduce((sum, tx) => sum + transactionMonthlyImpact(tx, viewingMonth), 0);
}

/** Bar segment when goal savings cannot map to a savings category (e.g. custom budgets). */
export const GOAL_SAVINGS_SYNTHETIC_CATEGORY_ID = -2;

/** Pie / bar slice for income not yet assigned to planned, unexpected, or goal savings. */
export const UNALLOCATED_CATEGORY_ID = -1;

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
  viewingMonth?: string,
): PlannedExpenseBarResult {
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const unexpectedByCategory: Record<number, number> = {};
  for (const tx of unexpectedTxs) {
    const impact = viewingMonth
      ? transactionMonthlyImpact(tx, viewingMonth)
      : tx.amount;
    if (impact <= 0) continue;
    if (tx.subcategoryId == null) continue;
    const sub = subById.get(tx.subcategoryId);
    const pid = sub?.parentCategoryId;
    if (pid == null) continue;
    unexpectedByCategory[pid] = (unexpectedByCategory[pid] ?? 0) + impact;
  }

  const totalPlanned = subcategories.reduce(
    (sum, sub) => sum + plannedAmountFromSub(sub, viewingMonth),
    0,
  );
  const totalUnexpected = unexpectedTxs.reduce(
    (sum, tx) =>
      sum + (viewingMonth ? transactionMonthlyImpact(tx, viewingMonth) : tx.amount),
    0,
  );
  const totalGoalSavings = goalContributionTxs.reduce(
    (sum, tx) =>
      sum + (viewingMonth ? transactionMonthlyImpact(tx, viewingMonth) : tx.amount),
    0,
  );
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
    const planned = subs.reduce(
      (sum, sub) => sum + plannedAmountFromSub(sub, viewingMonth),
      0,
    );
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
      color: FUND_COLORS.goalSavings,
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

/** Dollar amount represented by a segment (includes unallocated income slice). */
export function segmentCommittedAmount(seg: PlannedBarSeg, income: number): number {
  const committed = seg.planned + seg.unexpected + seg.goalSavings;
  if (committed > 0) return committed;
  if (income > 0 && seg.categoryId === UNALLOCATED_CATEGORY_ID) {
    return (seg.barWidthPct / 100) * income;
  }
  return 0;
}

/** Slice size for pie charts — matches the category distribution bar. */
export function segmentPieSliceValue(seg: PlannedBarSeg): number {
  return Math.max(0, seg.barWidthPct);
}

/** Segments for the “where it goes” pie, including unallocated income when present. */
export function buildPieSegments(
  barResult: PlannedExpenseBarResult,
  income: number,
): PlannedBarSeg[] {
  const parts = barResult.categoryParts;
  if (!parts.length) return [];
  const unalloc = barResult.unallocatedBarPct;
  if (unalloc > 0.05) {
    return [
      ...parts,
      {
        categoryId: UNALLOCATED_CATEGORY_ID,
        label: 'Unallocated',
        color: '#94a3b8',
        barWidthPct: unalloc,
        pctOfIncome: unalloc,
        planned: income > 0 ? (unalloc / 100) * income : 0,
        unexpected: 0,
        goalSavings: 0,
      },
    ];
  }
  return parts;
}

/** Keep actual pie slices in the same order as budget categories for side-by-side comparison. */
export function alignPieSegmentsToCategories(
  segments: PlannedBarSeg[],
  categories: BudgetCategory[],
): PlannedBarSeg[] {
  const byId = new Map(segments.map((s) => [s.categoryId, s]));
  const ordered: PlannedBarSeg[] = [];
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const cat of sorted) {
    const seg = byId.get(cat.id);
    if (seg) ordered.push(seg);
  }
  for (const seg of segments) {
    if (!sorted.some((c) => c.id === seg.categoryId)) {
      ordered.push(seg);
    }
  }
  return ordered;
}

/** Target rule split as pie segments (mirrors buildPieSegments shape for comparison charts). */
export function buildTargetPieSegments(
  categories: BudgetCategory[],
  income: number,
): PlannedBarSeg[] {
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const segments: PlannedBarSeg[] = sorted.map((cat) => ({
    categoryId: cat.id,
    label: cat.label,
    color: cat.color,
    barWidthPct: cat.targetPercent,
    pctOfIncome: cat.targetPercent,
    planned: income > 0 ? (cat.targetPercent / 100) * income : 0,
    unexpected: 0,
    goalSavings: 0,
  }));
  const used = segments.reduce((sum, seg) => sum + seg.barWidthPct, 0);
  const unalloc = Math.max(0, 100 - used);
  if (unalloc > 0.05) {
    segments.push({
      categoryId: UNALLOCATED_CATEGORY_ID,
      label: 'Unallocated',
      color: '#94a3b8',
      barWidthPct: unalloc,
      pctOfIncome: unalloc,
      planned: income > 0 ? (unalloc / 100) * income : 0,
      unexpected: 0,
      goalSavings: 0,
    });
  }
  return segments;
}
