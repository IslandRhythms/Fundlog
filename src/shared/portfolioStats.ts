import type { PortfolioAccount, PortfolioSnapshot } from './types';

export type ValueChange = {
  absolute: number;
  /** Null when the baseline is 0 (percent undefined). */
  percent: number | null;
};

export type AccountValueStats = {
  current: PortfolioSnapshot | null;
  previous: PortfolioSnapshot | null;
  first: PortfolioSnapshot | null;
  changeVsPrevious: ValueChange | null;
  changeVsFirst: ValueChange | null;
  high: number | null;
  low: number | null;
};

export type PortfolioTotalStats = {
  /** Carry-forward total as of `asOfDate` (last known value per account). */
  total: number;
  /** Most recent calendar day that has any snapshot across accounts. */
  asOfDate: string | null;
  /** Carry-forward total on `previousDate`. */
  previousTotal: number | null;
  /** Prior calendar day that had any snapshot across accounts. */
  previousDate: string | null;
  change: ValueChange | null;
  accountsWithValue: number;
};

export function dollarChange(from: number, to: number): number {
  return to - from;
}

export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / from) * 100;
}

export function valueChange(from: number, to: number): ValueChange {
  return {
    absolute: dollarChange(from, to),
    percent: pctChange(from, to),
  };
}

export function latestSnapshot(
  snapshots: PortfolioSnapshot[],
): PortfolioSnapshot | null {
  if (!snapshots.length) return null;
  return snapshots[snapshots.length - 1] ?? null;
}

/** Last known value for an account on or before `date` (snapshots must be date-asc). */
export function valueOnOrBefore(
  snapshots: PortfolioSnapshot[],
  date: string,
): number | null {
  let value: number | null = null;
  for (const s of snapshots) {
    if (s.date <= date) value = s.value;
    else break;
  }
  return value;
}

export function totalOnDate(
  accounts: PortfolioAccount[],
  date: string,
): number {
  let sum = 0;
  for (const a of accounts) {
    const value = valueOnOrBefore(a.snapshots, date);
    if (value != null) sum += value;
  }
  return sum;
}

export function accountValueStats(
  account: PortfolioAccount,
): AccountValueStats {
  const snaps = account.snapshots;
  if (!snaps.length) {
    return {
      current: null,
      previous: null,
      first: null,
      changeVsPrevious: null,
      changeVsFirst: null,
      high: null,
      low: null,
    };
  }
  const current = snaps[snaps.length - 1]!;
  const first = snaps[0]!;
  const previous = snaps.length >= 2 ? snaps[snaps.length - 2]! : null;
  const values = snaps.map((s) => s.value);
  return {
    current,
    previous,
    first,
    changeVsPrevious: previous
      ? valueChange(previous.value, current.value)
      : null,
    changeVsFirst:
      snaps.length >= 2 ? valueChange(first.value, current.value) : null,
    high: Math.max(...values),
    low: Math.min(...values),
  };
}

/**
 * Portfolio totals use carry-forward: on a given day, each account contributes
 * its last logged value on or before that day. Headline total and period change
 * share that definition so they stay aligned.
 */
export function portfolioTotalStats(
  accounts: PortfolioAccount[],
): PortfolioTotalStats {
  const accountsWithValue = accounts.filter(
    (a) => latestSnapshot(a.snapshots) != null,
  ).length;

  const allDates = new Set<string>();
  for (const a of accounts) {
    for (const s of a.snapshots) allDates.add(s.date);
  }
  const sortedDates = [...allDates].sort();

  if (!sortedDates.length) {
    return {
      total: 0,
      asOfDate: null,
      previousTotal: null,
      previousDate: null,
      change: null,
      accountsWithValue,
    };
  }

  const asOfDate = sortedDates[sortedDates.length - 1]!;
  const total = totalOnDate(accounts, asOfDate);

  if (sortedDates.length < 2) {
    return {
      total,
      asOfDate,
      previousTotal: null,
      previousDate: null,
      change: null,
      accountsWithValue,
    };
  }

  const previousDate = sortedDates[sortedDates.length - 2]!;
  const previousTotal = totalOnDate(accounts, previousDate);

  return {
    total,
    asOfDate,
    previousTotal,
    previousDate,
    change: valueChange(previousTotal, total),
    accountsWithValue,
  };
}
