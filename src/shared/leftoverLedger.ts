import type { BudgetCategory, BudgetSubcategory, Transaction } from './types';
import { plannedAmountFromSub, transactionMonthlyImpact } from './plannedExpenseBar';
import { FUND_COLORS } from './fundColors';

export type LedgerKind = 'planned' | 'purchase' | 'unexpected' | 'goal';

/** One thing drawing down this month's "left to work with". */
export type LedgerRow = {
  key: string;
  kind: LedgerKind;
  label: string;
  categoryLabel: string | null;
  color: string;
  /** Amount that hits this month (spread-aware). */
  amount: number;
};

/**
 * Every planned line item, purchase, unexpected expense, and goal contribution affecting
 * `month`, largest first. Sums to the same committed total as the planned expense bar.
 */
export function computeLeftoverLedger(
  categories: BudgetCategory[],
  subcategories: BudgetSubcategory[],
  purchaseTxs: Transaction[],
  unexpectedTxs: Transaction[],
  goalTxs: Transaction[],
  month: string,
): LedgerRow[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const categoryForSub = (subId: number | null): BudgetCategory | null => {
    if (subId == null) return null;
    const pid = subById.get(subId)?.parentCategoryId;
    return pid == null ? null : catById.get(pid) ?? null;
  };

  const rows: LedgerRow[] = [];

  for (const sub of subcategories) {
    const amount = plannedAmountFromSub(sub, month);
    if (amount <= 0) continue;
    const cat = categoryForSub(sub.id);
    rows.push({
      key: `planned-${sub.id}`,
      kind: 'planned',
      label: sub.label,
      categoryLabel: cat?.label ?? null,
      color: cat?.color ?? FUND_COLORS.unassigned,
      amount,
    });
  }

  const txRow = (tx: Transaction, kind: LedgerKind, fallback: string, fallbackColor: string) => {
    const amount = transactionMonthlyImpact(tx, month);
    if (amount <= 0) return;
    const cat = categoryForSub(tx.subcategoryId);
    rows.push({
      key: `${kind}-${tx.id}`,
      kind,
      label: tx.description?.trim() || tx.merchant?.trim() || fallback,
      categoryLabel: cat?.label ?? null,
      color: cat?.color ?? fallbackColor,
      amount,
    });
  };

  for (const tx of purchaseTxs) txRow(tx, 'purchase', 'Purchase', FUND_COLORS.purchase);
  for (const tx of unexpectedTxs) txRow(tx, 'unexpected', 'Unexpected expense', FUND_COLORS.unexpected);
  for (const tx of goalTxs) txRow(tx, 'goal', 'Goal savings', FUND_COLORS.goalSavings);

  return rows.sort((a, b) => b.amount - a.amount);
}
