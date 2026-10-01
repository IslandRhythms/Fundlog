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
  leftoverApplied = 0,
): number {
  if (g.targetAmount <= 0) return 0;
  const eff =
    effectiveProgressTowardTarget(g, savedRecorded, allocations, subcategories) + leftoverApplied;
  return Math.min(100, (eff / g.targetAmount) * 100);
}

/**
 * Hand last month's positive leftover to goals by priority (highest first, newest breaks
 * ties), filling each goal's gap after recorded savings and this month's linked plan.
 */
export function allocateLeftoverToGoals(
  goals: Goal[],
  leftover: number,
  savedFor: (goalId: number) => number,
  allocations: GoalAllocation[],
  subcategories: BudgetSubcategory[],
): Record<number, number> {
  const applied: Record<number, number> = {};
  let pool = Math.max(0, leftover);
  const ordered = [...goals].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.createdAt.localeCompare(a.createdAt);
  });
  for (const g of ordered) {
    if (pool <= 0) break;
    const progress = effectiveProgressTowardTarget(g, savedFor(g.id), allocations, subcategories);
    const share = Math.min(pool, Math.max(0, g.targetAmount - progress));
    if (share > 0) {
      applied[g.id] = share;
      pool -= share;
    }
  }
  return applied;
}
