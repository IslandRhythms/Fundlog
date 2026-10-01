import type { RetirementInputs } from './types';

export const DEFAULT_RETIREMENT_INPUTS: RetirementInputs = {
  currentAge: 30,
  retirementAge: 65,
  currentInvested: 0,
  annualContribution: 0,
  annualSpending: 40000,
  leanAnnualSpending: 25000,
  fatAnnualSpending: 100000,
  baristaAnnualIncome: 20000,
  expectedReturnPct: 7,
  inflationPct: 3,
  withdrawalRatePct: 4,
};

/** Ages later than this many years from now are reported as not reachable. */
const MAX_SEARCH_MONTHS = 80 * 12;

export type FireTargetKey = 'lean' | 'regular' | 'fat' | 'barista';

export type FireTarget = {
  key: FireTargetKey;
  label: string;
  /** Spending the portfolio has to cover each year. */
  coveredSpending: number;
  number: number;
  reached: boolean;
  /** Keeps contributing past retirement age if needed; null when not reachable at all. */
  monthsToReach: number | null;
  ageReached: number | null;
  /** Only reached by working past the target retirement age. */
  afterRetirement: boolean;
  /** Projected balance at target retirement age minus the target; negative means short. */
  surplusAtRetirement: number;
  /** Yearly contribution that reaches the target exactly at retirement age; null if already there. */
  requiredAnnualContribution: number | null;
};

export type CoastFireResult = {
  /** Invested today that grows to the FIRE number by retirement age with no more contributions. */
  numberToday: number;
  reached: boolean;
  /**
   * Months of contributing until you can stop and still coast to FIRE on time. Past retirement
   * age the requirement is the full FIRE number, so this keeps working until that's reached.
   */
  monthsToCoast: number | null;
  coastAge: number | null;
  /** Coast is only reached by working past the target retirement age. */
  afterRetirement: boolean;
  /** What today's balance grows to by retirement age if you stop contributing now. */
  balanceAtRetirementIfStopped: number;
};

export type ProjectionPoint = {
  age: number;
  /** Contributions until retirement age, then yearly spending is withdrawn. */
  balance: number;
  /** Coast FIRE requirement at this age; null after retirement age. */
  coastRequired: number | null;
};

export type RetirementResult = {
  realReturnPct: number;
  targets: FireTarget[];
  coast: CoastFireResult;
  balanceAtRetirement: number;
  projection: ProjectionPoint[];
};

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Inflation-adjusted annual return, so all results stay in today's dollars. */
export function realAnnualReturn(nominalPct: number, inflationPct: number): number {
  return (1 + finite(nominalPct) / 100) / (1 + finite(inflationPct) / 100) - 1;
}

export function fireNumber(annualSpending: number, withdrawalRatePct: number): number {
  const rate = finite(withdrawalRatePct) / 100;
  if (rate <= 0) return Infinity;
  return Math.max(0, finite(annualSpending)) / rate;
}

/** Months of contributing until `target`, searching no further than `maxMonths`. */
function monthsToReach(
  start: number,
  monthlyContribution: number,
  monthlyRate: number,
  target: number,
  maxMonths: number,
): number | null {
  if (start >= target) return 0;
  let balance = start;
  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= target) return m;
  }
  return null;
}

function balanceAfterMonths(
  start: number,
  monthlyContribution: number,
  monthlyRate: number,
  months: number,
): number {
  let balance = start;
  for (let m = 0; m < months; m++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
  }
  return balance;
}

/** Level monthly contribution × 12 that grows `start` to `target` in `months`. */
function requiredAnnualContribution(
  start: number,
  monthlyRate: number,
  months: number,
  target: number,
): number | null {
  if (!Number.isFinite(target) || start >= target) return null;
  if (months <= 0) return Infinity;
  const growth = Math.pow(1 + monthlyRate, months);
  const annuityFactor = monthlyRate === 0 ? months : (growth - 1) / monthlyRate;
  return Math.max(0, (target - start * growth) / annuityFactor) * 12;
}

export function computeRetirement(raw: RetirementInputs): RetirementResult {
  const currentAge = finite(raw.currentAge);
  const retirementAge = Math.max(currentAge, finite(raw.retirementAge));
  const invested = Math.max(0, finite(raw.currentInvested));
  const monthlyContribution = Math.max(0, finite(raw.annualContribution)) / 12;
  const spending = Math.max(0, finite(raw.annualSpending));
  const swr = raw.withdrawalRatePct;

  const r = realAnnualReturn(raw.expectedReturnPct, raw.inflationPct);
  const monthlyRate = Math.pow(1 + r, 1 / 12) - 1;
  const yearsToRetirement = retirementAge - currentAge;
  const monthsToRetirement = Math.round(yearsToRetirement * 12);

  const targetDefs: { key: FireTargetKey; label: string; coveredSpending: number }[] = [
    { key: 'lean', label: 'Lean FIRE', coveredSpending: Math.max(0, finite(raw.leanAnnualSpending)) },
    { key: 'regular', label: 'FIRE', coveredSpending: spending },
    { key: 'fat', label: 'Fat FIRE', coveredSpending: Math.max(0, finite(raw.fatAnnualSpending)) },
    {
      key: 'barista',
      label: 'Barista FIRE',
      coveredSpending: Math.max(0, spending - Math.max(0, finite(raw.baristaAnnualIncome))),
    },
  ];

  const balanceAtRetirement = balanceAfterMonths(
    invested,
    monthlyContribution,
    monthlyRate,
    monthsToRetirement,
  );

  const targets: FireTarget[] = targetDefs.map((def) => {
    const number = fireNumber(def.coveredSpending, swr);
    const months = Number.isFinite(number)
      ? monthsToReach(invested, monthlyContribution, monthlyRate, number, MAX_SEARCH_MONTHS)
      : null;
    return {
      ...def,
      number,
      reached: invested >= number,
      monthsToReach: months,
      ageReached: months == null ? null : currentAge + months / 12,
      afterRetirement: months != null && months > monthsToRetirement,
      surplusAtRetirement: balanceAtRetirement - number,
      requiredAnnualContribution: requiredAnnualContribution(
        invested,
        monthlyRate,
        monthsToRetirement,
        number,
      ),
    };
  });

  const regularNumber = fireNumber(spending, swr);
  const coastRequiredAt = (monthsFromNow: number): number => {
    const monthsLeft = Math.max(0, monthsToRetirement - monthsFromNow);
    return regularNumber / Math.pow(1 + monthlyRate, monthsLeft);
  };

  let monthsToCoast: number | null = null;
  if (Number.isFinite(regularNumber)) {
    let balance = invested;
    for (let m = 0; m <= MAX_SEARCH_MONTHS; m++) {
      if (balance >= coastRequiredAt(m)) {
        monthsToCoast = m;
        break;
      }
      balance = balance * (1 + monthlyRate) + monthlyContribution;
    }
  }

  const coast: CoastFireResult = {
    numberToday: coastRequiredAt(0),
    reached: monthsToCoast === 0,
    monthsToCoast,
    coastAge: monthsToCoast == null ? null : currentAge + monthsToCoast / 12,
    afterRetirement: monthsToCoast != null && monthsToCoast > monthsToRetirement,
    balanceAtRetirementIfStopped: balanceAfterMonths(invested, 0, monthlyRate, monthsToRetirement),
  };

  const endAge = Math.max(currentAge, Math.min(100, Math.max(retirementAge + 25, currentAge + 10)));
  const monthlyWithdrawal = spending / 12;
  const projection: ProjectionPoint[] = [];
  let balance = invested;
  for (let year = 0; currentAge + year <= endAge; year++) {
    const months = year * 12;
    projection.push({
      age: currentAge + year,
      balance,
      coastRequired:
        months <= monthsToRetirement && Number.isFinite(regularNumber)
          ? coastRequiredAt(months)
          : null,
    });
    for (let m = months + 1; m <= months + 12; m++) {
      const grown = balance * (1 + monthlyRate);
      balance =
        m <= monthsToRetirement
          ? grown + monthlyContribution
          : Math.max(0, grown - monthlyWithdrawal);
    }
  }

  return {
    realReturnPct: r * 100,
    targets,
    coast,
    balanceAtRetirement,
    projection,
  };
}
