import type { BudgetCategory, BudgetSubcategory, Transaction } from './types';
import { plannedAmountFromSub, transactionMonthlyImpact } from './plannedExpenseBar';

/** A single purchase or unexpected expense, with its impact on this month's leftover. */
export type ImpactTxn = {
  id: number;
  kind: 'purchase' | 'unexpected';
  label: string;
  merchant: string | null;
  date: string;
  /** Amount that affects this month's leftover (spread-aware). */
  amount: number;
};

export type CategoryImpact = {
  id: number;
  label: string;
  color: string;
  planned: number;
  purchases: number;
  unexpected: number;
  /** Purchases + unexpected — the spend logged on top of the plan this month. */
  extra: number;
  /** Planned + extra — total income committed to this category this month. */
  committed: number;
  /** The individual purchase/unexpected entries behind `extra`, largest first. */
  items: ImpactTxn[];
};

/** Build a display-ready impact entry from a transaction, or null when it doesn't affect this month. */
export function buildImpactTxn(
  tx: Transaction,
  kind: 'purchase' | 'unexpected',
  viewingMonth: string,
): ImpactTxn | null {
  const amount = transactionMonthlyImpact(tx, viewingMonth);
  if (amount <= 0) return null;
  const merchant = tx.merchant?.trim() || null;
  const label =
    tx.description?.trim() ||
    merchant ||
    (kind === 'purchase' ? 'Purchase' : 'Unexpected expense');
  return { id: tx.id, kind, label, merchant, date: tx.date, amount };
}

/**
 * Per category: this month's planned amount plus the purchases and unexpected
 * spending logged on top of it. Mirrors the "on top" budget model where any
 * purchase/unexpected entry is additional commitment that reduces money left.
 */
export function computeCategoryImpact(
  categories: BudgetCategory[],
  groupedSubcategories: Record<number, BudgetSubcategory[]>,
  subcategories: BudgetSubcategory[],
  purchaseTxs: Transaction[],
  unexpectedTxs: Transaction[],
  viewingMonth: string,
): CategoryImpact[] {
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const parentOf = (subId: number | null): number | null => {
    if (subId == null) return null;
    return subById.get(subId)?.parentCategoryId ?? null;
  };

  const purchasesByCat: Record<number, number> = {};
  const unexpectedByCat: Record<number, number> = {};
  const itemsByCat: Record<number, ImpactTxn[]> = {};

  for (const tx of purchaseTxs) {
    const pid = parentOf(tx.subcategoryId);
    if (pid == null) continue;
    const item = buildImpactTxn(tx, 'purchase', viewingMonth);
    if (!item) continue;
    purchasesByCat[pid] = (purchasesByCat[pid] ?? 0) + item.amount;
    (itemsByCat[pid] ??= []).push(item);
  }
  for (const tx of unexpectedTxs) {
    const pid = parentOf(tx.subcategoryId);
    if (pid == null) continue;
    const item = buildImpactTxn(tx, 'unexpected', viewingMonth);
    if (!item) continue;
    unexpectedByCat[pid] = (unexpectedByCat[pid] ?? 0) + item.amount;
    (itemsByCat[pid] ??= []).push(item);
  }

  return categories
    .map((cat) => {
      const subs = groupedSubcategories[cat.id] ?? [];
      const planned = subs.reduce(
        (sum, sub) => sum + plannedAmountFromSub(sub, viewingMonth),
        0,
      );
      const purchases = purchasesByCat[cat.id] ?? 0;
      const unexpected = unexpectedByCat[cat.id] ?? 0;
      const extra = purchases + unexpected;
      const items = (itemsByCat[cat.id] ?? []).sort((a, b) => b.amount - a.amount);
      return {
        id: cat.id,
        label: cat.label,
        color: cat.color,
        planned,
        purchases,
        unexpected,
        extra,
        committed: planned + extra,
        items,
      };
    })
    .filter((row) => row.planned > 0 || row.extra > 0)
    .sort((a, b) => {
      if (b.extra !== a.extra) return b.extra - a.extra;
      return b.committed - a.committed;
    });
}
