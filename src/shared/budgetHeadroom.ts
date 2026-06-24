import type { BudgetCategory } from './types';
import type { PlannedBarSeg, PlannedExpenseBarResult } from './plannedExpenseBar';
import { formatAmount } from './formatMoney';

export type BucketRemainder = {
  ruleKey: string;
  label: string;
  color: string;
  targetAmount: number;
  committed: number;
  remaining: number;
};

export type SpendingTierStatus =
  | 'spend-here'
  | 'available'
  | 'bleeding'
  | 'danger'
  | 'depleted'
  | 'over';

export type SpendingTier = {
  key: 'wants' | 'needs' | 'savings';
  label: string;
  shortLabel: string;
  amount: number;
  status: SpendingTierStatus;
  bleedIn: number;
  hint: string;
};

export type SpendingTiersResult = {
  tiers: SpendingTier[];
  activeTierKey: 'wants' | 'needs' | 'savings' | 'over';
  memorableLine: string | null;
};

export type BudgetHeadroomResult = {
  income: number;
  committedTotal: number;
  moneyLeft: number;
  usedPct: number;
  isOverCommitted: boolean;
  buckets: BucketRemainder[];
  discretionaryLeft: number;
  savingsRoomLeft: number;
  needsCushion: number;
  spendingTiers: SpendingTiersResult;
};

function segmentForCategory(
  parts: PlannedBarSeg[],
  categoryId: number,
): PlannedBarSeg | undefined {
  return parts.find((p) => p.categoryId === categoryId);
}

function bucketLabel(buckets: BucketRemainder[], key: string, fallback: string): string {
  return buckets.find((b) => b.ruleKey === key)?.label ?? fallback;
}

export function computeSpendingTiers(
  wantsRemaining: number,
  needsRemaining: number,
  savingsRemaining: number,
  moneyLeft: number,
  buckets: BucketRemainder[],
): SpendingTiersResult {
  const wantsLabel = bucketLabel(buckets, 'wants', 'Wants');
  const needsLabel = bucketLabel(buckets, 'needs', 'Needs');
  const savingsLabel = bucketLabel(buckets, 'savingsDebt', 'Savings');

  const wantsOverspend = wantsRemaining < 0 ? -wantsRemaining : 0;
  const needsAfterWantsBleed = needsRemaining - wantsOverspend;
  const needsOverspend = needsAfterWantsBleed < 0 ? -needsAfterWantsBleed : 0;
  const savingsAfterBleed = savingsRemaining - needsOverspend;

  let activeTierKey: SpendingTiersResult['activeTierKey'] = 'wants';
  if (moneyLeft < 0) {
    activeTierKey = 'over';
  } else if (wantsRemaining > 0) {
    activeTierKey = 'wants';
  } else if (needsAfterWantsBleed > 0) {
    activeTierKey = 'needs';
  } else if (savingsAfterBleed > 0 || savingsRemaining > 0) {
    activeTierKey = 'savings';
  } else {
    activeTierKey = 'over';
  }

  const wantsTier: SpendingTier = {
    key: 'wants',
    label: wantsLabel,
    shortLabel: 'Wants',
    amount: Math.max(0, wantsRemaining),
    status:
      moneyLeft < 0
        ? 'over'
        : wantsRemaining > 0
          ? 'spend-here'
          : 'depleted',
    bleedIn: 0,
    hint:
      wantsRemaining > 0
        ? 'Safe to spend on lifestyle & wants first'
        : wantsOverspend > 0
          ? `Overspent wants by ${formatPlain(wantsOverspend)} — now tapping needs`
          : 'Wants bucket used up',
  };

  const needsTier: SpendingTier = {
    key: 'needs',
    label: needsLabel,
    shortLabel: 'Needs',
    amount: Math.max(0, needsAfterWantsBleed),
    status:
      moneyLeft < 0
        ? 'over'
        : wantsOverspend > 0 && needsAfterWantsBleed > 0
          ? 'bleeding'
          : wantsOverspend > 0 && needsAfterWantsBleed <= 0
            ? 'depleted'
            : needsAfterWantsBleed > 0
              ? 'available'
              : 'depleted',
    bleedIn: wantsOverspend,
    hint:
      wantsOverspend > 0 && needsAfterWantsBleed > 0
        ? `Wants overspend is eating ${formatPlain(Math.min(wantsOverspend, needsRemaining))} of needs cushion`
        : needsOverspend > 0
          ? 'Needs cushion gone — bleeding into savings'
          : needsAfterWantsBleed > 0
            ? 'Essentials cushion — not for discretionary spending'
            : 'Needs fully allocated',
  };

  const savingsTier: SpendingTier = {
    key: 'savings',
    label: savingsLabel,
    shortLabel: 'Savings',
    amount: Math.max(0, savingsAfterBleed),
    status:
      moneyLeft < 0
        ? 'over'
        : needsOverspend > 0 || savingsAfterBleed < savingsRemaining
          ? 'danger'
          : savingsAfterBleed > 0
            ? 'available'
            : 'depleted',
    bleedIn: needsOverspend,
    hint:
      needsOverspend > 0
        ? 'Do not spend — you are eating into savings & debt room'
        : savingsAfterBleed > 0
          ? 'Keep for goals & savings — avoid spending here'
          : 'Savings allocation used',
  };

  return {
    tiers: [wantsTier, needsTier, savingsTier],
    activeTierKey,
    memorableLine: buildMemorableLine(moneyLeft, wantsTier, needsTier, savingsTier, activeTierKey),
  };
}

function formatPlain(n: number): string {
  return formatAmount(n);
}

function buildMemorableLine(
  moneyLeft: number,
  wants: SpendingTier,
  needs: SpendingTier,
  savings: SpendingTier,
  active: SpendingTiersResult['activeTierKey'],
): string | null {
  if (moneyLeft < 0) return null;
  if (moneyLeft <= 0) return null;

  if (active === 'wants' && wants.amount > 0) {
    return `Remember: ${formatPlain(moneyLeft)} left — spend up to ${formatPlain(wants.amount)} on wants first`;
  }
  if (active === 'needs' && needs.amount > 0) {
    return `Remember: ${formatPlain(moneyLeft)} left — wants used up; ${formatPlain(needs.amount)} needs cushion left`;
  }
  if (active === 'savings' || savings.status === 'danger') {
    return `Warning: only ${formatPlain(savings.amount)} savings room left — avoid discretionary spending`;
  }
  return `Remember: ${formatPlain(moneyLeft)} left this month`;
}

export function computeBudgetHeadroom(
  categories: BudgetCategory[],
  barResult: PlannedExpenseBarResult,
  income: number,
): BudgetHeadroomResult {
  const committedTotal =
    barResult.totalPlanned + barResult.totalUnexpected + barResult.totalGoalSavings;
  const moneyLeft = income - committedTotal;
  const usedPct = income > 0 ? Math.min(100, (committedTotal / income) * 100) : 0;

  const buckets: BucketRemainder[] = categories.map((cat) => {
    const seg = segmentForCategory(barResult.categoryParts, cat.id);
    const committed = seg
      ? seg.planned + seg.unexpected + seg.goalSavings
      : 0;
    const targetAmount = income > 0 ? (income * cat.targetPercent) / 100 : 0;
    return {
      ruleKey: cat.ruleKey,
      label: cat.label,
      color: cat.color,
      targetAmount,
      committed,
      remaining: targetAmount - committed,
    };
  });

  const byKey = (key: string) => buckets.find((b) => b.ruleKey === key);

  const discretionaryLeft = byKey('wants')?.remaining ?? 0;
  const needsCushion = byKey('needs')?.remaining ?? 0;
  const savingsRoomLeft = byKey('savingsDebt')?.remaining ?? 0;

  const spendingTiers = computeSpendingTiers(
    discretionaryLeft,
    needsCushion,
    savingsRoomLeft,
    moneyLeft,
    buckets,
  );

  return {
    income,
    committedTotal,
    moneyLeft,
    usedPct,
    isOverCommitted: income > 0 && committedTotal > income,
    buckets,
    discretionaryLeft,
    savingsRoomLeft,
    needsCushion,
    spendingTiers,
  };
}
