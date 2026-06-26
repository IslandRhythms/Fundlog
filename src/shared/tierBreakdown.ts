import type { BudgetCategory, BudgetSubcategory, Transaction } from './types';
import { plannedAmountFromSub, transactionMonthlyImpact } from './plannedExpenseBar';
import { buildImpactTxn, type ImpactTxn } from './categoryImpact';

export type TierKey = 'wants' | 'needs' | 'savings';

export type TierLineItem = {
  id: number;
  label: string;
  planned: number;
  color: string;
};

export type TierSpend = {
  purchases: number;
  unexpected: number;
};

export type TierBreakdown = {
  /** Planned line items (subcategories) grouped by spending tier, largest first. */
  lineItems: Partial<Record<TierKey, TierLineItem[]>>;
  /** Purchases/unexpected totals per tier (logged at the category level). */
  spend: Partial<Record<TierKey, TierSpend>>;
  /** The individual purchase/unexpected entries behind each tier's spend, largest first. */
  items: Partial<Record<TierKey, ImpactTxn[]>>;
};

export function tierKeyForRule(ruleKey: string): TierKey | null {
  if (ruleKey === 'savingsDebt') return 'savings';
  if (ruleKey === 'needs') return 'needs';
  if (ruleKey === 'wants') return 'wants';
  return null;
}

/**
 * Build the spending-tier drilldown shown under "What's left": planned line items,
 * per-tier spend totals, and the individual transactions behind that spend.
 */
export function computeTierBreakdown(
  categories: BudgetCategory[],
  groupedSubcategories: Record<number, BudgetSubcategory[]>,
  purchaseTxs: Transaction[],
  unexpectedTxs: Transaction[],
  viewingMonth: string,
): TierBreakdown {
  const lineItems: Record<TierKey, TierLineItem[]> = { wants: [], needs: [], savings: [] };
  const spend: Record<TierKey, TierSpend> = {
    wants: { purchases: 0, unexpected: 0 },
    needs: { purchases: 0, unexpected: 0 },
    savings: { purchases: 0, unexpected: 0 },
  };
  const items: Record<TierKey, ImpactTxn[]> = { wants: [], needs: [], savings: [] };
  const subToTier: Record<number, TierKey> = {};

  for (const cat of categories) {
    const key = tierKeyForRule(cat.ruleKey);
    if (!key) continue;
    for (const sub of groupedSubcategories[cat.id] ?? []) {
      subToTier[sub.id] = key;
      const planned = plannedAmountFromSub(sub, viewingMonth);
      if (planned > 0) {
        lineItems[key].push({ id: sub.id, label: sub.label, planned, color: cat.color });
      }
    }
  }

  for (const tx of purchaseTxs) {
    if (tx.subcategoryId == null) continue;
    const key = subToTier[tx.subcategoryId];
    if (!key) continue;
    spend[key].purchases += transactionMonthlyImpact(tx, viewingMonth);
    const item = buildImpactTxn(tx, 'purchase', viewingMonth);
    if (item) items[key].push(item);
  }
  for (const tx of unexpectedTxs) {
    if (tx.subcategoryId == null) continue;
    const key = subToTier[tx.subcategoryId];
    if (!key) continue;
    spend[key].unexpected += transactionMonthlyImpact(tx, viewingMonth);
    const item = buildImpactTxn(tx, 'unexpected', viewingMonth);
    if (item) items[key].push(item);
  }

  for (const k of ['wants', 'needs', 'savings'] as const) {
    lineItems[k].sort((a, b) => b.planned - a.planned);
    items[k].sort((a, b) => b.amount - a.amount);
  }

  return { lineItems, spend, items };
}
