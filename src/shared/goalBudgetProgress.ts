import type { BudgetSubcategory, Goal, GoalAllocation } from './types';
import { plannedAmountFromSub } from './plannedExpenseBar';

/**
 * Sum of planned monthly amounts from budget lines linked to this goal (goal_allocations).
 * Respects optional percent (0–100); null percent means 100% of the line.
 */
export function monthlyPlanTowardGoal(
  goalId: number,
  allocations: GoalAllocation[],
  subcategories: BudgetSubcategory[],
): number {
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  let sum = 0;
  for (const a of allocations) {
    if (a.goalId !== goalId) continue;
    const sub = subById.get(a.subcategoryId);
    if (!sub) continue;
    const line = plannedAmountFromSub(sub);
    let f = 1;
    if (a.percent != null && Number.isFinite(a.percent)) {
      f = Math.min(100, Math.max(0, a.percent)) / 100;
    }
    sum += line * f;
  }
  return sum;
}

/**
 * Recorded savings plus up to the remaining gap filled by this month's linked plan (not double-counted across months).
 */
export function effectiveProgressTowardTarget(
  g: Goal,
  savedRecorded: number,
  allocations: GoalAllocation[],
  subcategories: BudgetSubcategory[],
): number {
  const gap = Math.max(0, g.targetAmount - savedRecorded);
  const planSlice = Math.min(gap, monthlyPlanTowardGoal(g.id, allocations, subcategories));
  return savedRecorded + planSlice;
}

export function goalProgressPctWithBudget(
  g: Goal,
  savedRecorded: number,
  allocations: GoalAllocation[],
  subcategories: BudgetSubcategory[],
): number {
  if (g.targetAmount <= 0) return 0;
  const eff = effectiveProgressTowardTarget(g, savedRecorded, allocations, subcategories);
  return Math.min(100, (eff / g.targetAmount) * 100);
}
