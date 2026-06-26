<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useDomainStore } from '../stores/domain';
import BudgetPieCompare from '../components/BudgetPieCompare.vue';
import CollapsibleSection from '../components/CollapsibleSection.vue';
import LoadingView from '../components/LoadingView.vue';
import MoneyLeftSummary from '../components/MoneyLeftSummary.vue';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import {
  computePlannedExpenseBarSegments,
  buildPieSegments,
  plannedAmountFromSub,
  transactionMonthlyImpact,
} from '../shared/plannedExpenseBar';
import { computeBudgetHeadroom } from '../shared/budgetHeadroom';
import { buildImpactTxn } from '../shared/categoryImpact';
import type { ImpactTxn } from '../shared/categoryImpact';
import type { TierLineItem, TierSpend } from '../components/MoneyLeftSummary.vue';
import {
  goalProgressPctWithBudget,
  monthlyPlanTowardGoal,
} from '../shared/goalBudgetProgress';
import { calendarMonthNow } from '../shared/calendarMonth';
import type {
  BudgetCategory,
  BudgetSubcategory,
  Goal,
  GoalAllocation,
  Profile,
  Transaction,
} from '../shared/types';

const domain = useDomainStore();

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpectedTxs = ref<Transaction[]>([]);
const purchaseTxs = ref<Transaction[]>([]);
const goalContributionTxs = ref<Transaction[]>([]);
const goalAllocations = ref<GoalAllocation[]>([]);
const loading = ref(false);

const activeBudget = computed(() => domain.activeBudget);
const goals = computed(() => domain.goals);
const transactions = computed(() => domain.transactions);

const groupedSubcategories = computed(() => {
  const grouped: Record<number, BudgetSubcategory[]> = {};
  for (const sub of subcategories.value) {
    const parentId = sub.parentCategoryId ?? 0;
    if (!grouped[parentId]) grouped[parentId] = [];
    grouped[parentId].push(sub);
  }
  return grouped;
});

async function loadCategories() {
  if (!activeBudget.value || !domain.activeProfileId) return;
  loading.value = true;
  try {
    const result = await window.fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = result.categories;
    subcategories.value = result.subcategories;
    const [unexpected, purchases, goalContrib] = await Promise.all([
      window.fundlog.transaction.listUnexpected(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
      window.fundlog.transaction.listPurchases(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
      window.fundlog.transaction.listGoalContributions(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
    ]);
    unexpectedTxs.value = unexpected;
    purchaseTxs.value = purchases;
    goalContributionTxs.value = goalContrib;
  } finally {
    loading.value = false;
  }
}

async function loadGoalAllocations() {
  if (!domain.activeProfileId) {
    goalAllocations.value = [];
    return;
  }
  try {
    goalAllocations.value = await window.fundlog.goalAllocation.listByProfile(
      domain.activeProfileId,
    );
  } catch {
    goalAllocations.value = [];
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await domain.loadGoals();
  await domain.loadTransactions();
  await loadCategories();
  await loadGoalAllocations();
});

watch(
  () => domain.activeBudgetId,
  async () => {
    await loadCategories();
    await loadGoalAllocations();
  },
);

watch(
  () => domain.activeProfileId,
  async () => {
    await loadCategories();
    await loadGoalAllocations();
  },
);

const baseMonthlyIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const monthlyIncome = computed(() => {
  const b = activeBudget.value;
  if (!b) return 0;
  return domain.effectiveMonthlyIncomeFor(b.id, calendarMonthNow());
});

const monthIncomeBoost = computed(() =>
  Math.max(0, monthlyIncome.value - baseMonthlyIncome.value),
);

const plannedBarResult = computed(() =>
  computePlannedExpenseBarSegments(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    unexpectedTxs.value,
    purchaseTxs.value,
    goalContributionTxs.value,
    monthlyIncome.value,
    calendarMonthNow(),
  ),
);

const headroom = computed(() =>
  computeBudgetHeadroom(categories.value, plannedBarResult.value, monthlyIncome.value),
);

const monthLabel = computed(() => {
  const ym = calendarMonthNow();
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

const pieSegments = computed(() => buildPieSegments(plannedBarResult.value, monthlyIncome.value));

type TierKey = 'wants' | 'needs' | 'savings';

function tierKeyForRule(ruleKey: string): TierKey | null {
  if (ruleKey === 'savingsDebt') return 'savings';
  if (ruleKey === 'needs') return 'needs';
  if (ruleKey === 'wants') return 'wants';
  return null;
}

/** Planned line items (subcategories) grouped by spending tier. */
const tierLineItems = computed<Partial<Record<TierKey, TierLineItem[]>>>(() => {
  const month = calendarMonthNow();
  const out: Record<TierKey, TierLineItem[]> = { wants: [], needs: [], savings: [] };

  for (const cat of categories.value) {
    const key = tierKeyForRule(cat.ruleKey);
    if (!key) continue;
    const subs = groupedSubcategories.value[cat.id] ?? [];
    for (const sub of subs) {
      const planned = plannedAmountFromSub(sub, month);
      if (planned <= 0) continue;
      out[key].push({ id: sub.id, label: sub.label, planned, color: cat.color });
    }
  }

  for (const k of ['wants', 'needs', 'savings'] as const) {
    out[k].sort((a, b) => b.planned - a.planned);
  }
  return out;
});

/**
 * Actual spend per tier this month. Purchases/unexpected are logged at the category
 * level, so they're summarised per tier rather than per line item.
 */
const tierSpend = computed<Partial<Record<TierKey, TierSpend>>>(() => {
  const month = calendarMonthNow();
  const subToTier: Record<number, TierKey> = {};
  for (const cat of categories.value) {
    const key = tierKeyForRule(cat.ruleKey);
    if (!key) continue;
    for (const sub of groupedSubcategories.value[cat.id] ?? []) {
      subToTier[sub.id] = key;
    }
  }

  const out: Record<TierKey, TierSpend> = {
    wants: { purchases: 0, unexpected: 0 },
    needs: { purchases: 0, unexpected: 0 },
    savings: { purchases: 0, unexpected: 0 },
  };

  for (const tx of purchaseTxs.value) {
    if (tx.subcategoryId == null) continue;
    const key = subToTier[tx.subcategoryId];
    if (!key) continue;
    out[key].purchases += transactionMonthlyImpact(tx, month);
  }
  for (const tx of unexpectedTxs.value) {
    if (tx.subcategoryId == null) continue;
    const key = subToTier[tx.subcategoryId];
    if (!key) continue;
    out[key].unexpected += transactionMonthlyImpact(tx, month);
  }
  return out;
});

/** The individual purchase/unexpected entries behind each tier's spend, largest first. */
const tierItems = computed<Partial<Record<TierKey, ImpactTxn[]>>>(() => {
  const month = calendarMonthNow();
  const subToTier: Record<number, TierKey> = {};
  for (const cat of categories.value) {
    const key = tierKeyForRule(cat.ruleKey);
    if (!key) continue;
    for (const sub of groupedSubcategories.value[cat.id] ?? []) {
      subToTier[sub.id] = key;
    }
  }

  const out: Record<TierKey, ImpactTxn[]> = { wants: [], needs: [], savings: [] };

  const collect = (tx: Transaction, kind: 'purchase' | 'unexpected') => {
    if (tx.subcategoryId == null) return;
    const key = subToTier[tx.subcategoryId];
    if (!key) return;
    const item = buildImpactTxn(tx, kind, month);
    if (item) out[key].push(item);
  };

  for (const tx of purchaseTxs.value) collect(tx, 'purchase');
  for (const tx of unexpectedTxs.value) collect(tx, 'unexpected');

  for (const k of ['wants', 'needs', 'savings'] as const) {
    out[k].sort((a, b) => b.amount - a.amount);
  }
  return out;
});

const allocationTargetCaption = computed(() => {
  const b = activeBudget.value;
  if (!b) return '';
  if (b.ruleSet === 'fiftyThirtyTwenty') return '50 / 30 / 20 rule targets';
  return 'Custom category targets';
});

function formatMoney(amount: number) {
  const code = activeProfile.value?.currencyCode?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: code });
  } catch {
    return `${amount.toLocaleString()} ${code}`;
  }
}

const totalPercent = computed(() => plannedBarResult.value.combinedOfIncomePct);

const recentTransactions = computed(() => transactions.value.slice(0, 5));

function formatTxTitle(tx: Transaction) {
  const base = (tx.description || tx.merchant || '—').trim();
  if (base.length <= 40) return base;
  return `${base.slice(0, 37)}...`;
}

const activeGoals = computed(() =>
  [...goals.value]
    .filter((g) => g.showOnDashboard)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3),
);

function formatGoalMoney(amount: number) {
  const code = activeProfile.value?.currencyCode?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: code });
  } catch {
    return `${amount.toLocaleString()} ${code}`;
  }
}

function formatGoalDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function savedTowardGoal(goalId: number): number {
  return transactions.value
    .filter((t) => t.goalId === goalId)
    .reduce((sum, t) => sum + t.amount, 0);
}

function goalProgressPctRecorded(g: Goal): number {
  if (g.targetAmount <= 0) return 0;
  return Math.min(100, (savedTowardGoal(g.id) / g.targetAmount) * 100);
}

/** Bar width: recorded savings plus this month’s linked plan slice (capped to remaining gap). */
function goalProgressPctForBar(g: Goal): number {
  return goalProgressPctWithBudget(
    g,
    savedTowardGoal(g.id),
    goalAllocations.value,
    subcategories.value,
  );
}

function goalPlanThisMonthOnDashboard(g: Goal): number {
  return monthlyPlanTowardGoal(g.id, goalAllocations.value, subcategories.value);
}

/** Saved amount meets or exceeds target (green styling only in this case). */
function goalSavingMatchedTarget(g: Goal): boolean {
  if (g.targetAmount <= 0) return false;
  return savedTowardGoal(g.id) + 1e-9 >= g.targetAmount;
}

function activityKindLabel(tx: Transaction): string {
  if (tx.goalId != null) return 'Goal saving';
  if (tx.entryKind === 'purchase') return 'Purchase';
  if (tx.entryKind === 'unexpected') return 'Unexpected expense';
  if (tx.source === 'csv') return 'Imported expense';
  if (tx.source === 'ocr') return 'Receipt expense';
  if (tx.source === 'manual' && tx.subcategoryId != null) return 'Manual expense';
  return 'Manual entry';
}

function activityKindClass(tx: Transaction): string {
  if (tx.goalId != null) return 'dashboard-activity-row__kind--saving';
  if (tx.entryKind === 'purchase') return 'dashboard-activity-row__kind--purchase';
  if (tx.entryKind === 'unexpected') return 'dashboard-activity-row__kind--unexpected';
  return 'dashboard-activity-row__kind--expense';
}

function activityKindDetail(tx: Transaction): string | null {
  if (tx.goalId == null) return null;
  const name = goals.value.find((x) => x.id === tx.goalId)?.name?.trim();
  return name || null;
}
</script>

<template>
  <div class="view view-dashboard container-fluid">
    <p class="view-page-eyebrow mb-1">Snapshot</p>
    <h2 class="mb-2">Dashboard</h2>
    <p class="view-subtitle mb-4">
      Your month at a glance — how much is safe to spend, and which bucket you’re in.
    </p>

    <div class="row g-3">
      <div v-if="activeBudget && !loading" class="col-12">
        <CollapsibleSection
          title="What's left"
          :meta="headroom.spendingTiers.memorableLine ?? monthLabel"
          storage-key="dashboard-money-left"
          integrated
        >
          <MoneyLeftSummary
            embedded
            variant="snapshot"
            :headroom="headroom"
            :currency-code="activeProfile?.currencyCode ?? 'USD'"
            :month-label="monthLabel"
            :tier-line-items="tierLineItems"
            :tier-spend="tierSpend"
            :tier-items="tierItems"
          />
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          class="dashboard-panel"
          title="Income allocation"
          :meta="activeBudget ? `${activeBudget.name} · ${monthLabel}` : undefined"
          :default-expanded="false"
          storage-key="dashboard-allocation-compare"
        >
          <p v-if="!activeBudget" class="mb-0">
            Create a budget to see your allocation here.
          </p>
          <LoadingView v-else-if="loading" message="Loading budget details…" />
          <BudgetPieCompare
            v-else-if="categories.length"
            :categories="categories"
            :actual-segments="pieSegments"
            :income="monthlyIncome"
            :currency-code="activeProfile?.currencyCode?.trim() || 'USD'"
            actual-caption="Planned, unexpected, and goal savings"
            :target-caption="allocationTargetCaption"
          />
          <p v-else class="small mb-0">
            Add expenses on <RouterLink to="/budgets">Budgets</RouterLink> to see the mix.
          </p>
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          class="dashboard-panel"
          title="Budget overview"
          :meta="activeBudget ? formatMoney(monthlyIncome) + ' effective income' : undefined"
          storage-key="dashboard-budget-overview"
        >
          <p v-if="!activeBudget" class="mb-0">
            Create a budget to see your allocation and expenses here.
          </p>
          <LoadingView v-else-if="loading" message="Loading budget details…" />
          <template v-else>
            <p v-if="monthIncomeBoost > 0" class="small mb-3">
              Includes {{ formatMoney(monthIncomeBoost) }} extra from
              <RouterLink to="/extra-income">Extra income</RouterLink>
            </p>

            <div class="budget-stat-grid mb-3">
                  <div class="budget-stat">
                    <div class="budget-stat__label">Planned</div>
                    <div class="budget-stat__value">{{ formatMoney(plannedBarResult.totalPlanned) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Purchases</div>
                    <div class="budget-stat__value">{{ formatMoney(plannedBarResult.totalPurchases) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Unexpected</div>
                    <div class="budget-stat__value">{{ formatMoney(plannedBarResult.totalUnexpected) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Goal savings</div>
                    <div class="budget-stat__value">{{ formatMoney(plannedBarResult.totalGoalSavings) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Combined</div>
                    <div class="budget-stat__value">
                      {{
                        formatMoney(
                          plannedBarResult.totalPlanned +
                            plannedBarResult.totalUnexpected +
                            plannedBarResult.totalPurchases +
                            plannedBarResult.totalGoalSavings,
                        )
                      }}
                    </div>
                    <div class="budget-stat__pct">{{ totalPercent.toFixed(1) }}% of income</div>
                  </div>
                </div>

                <PlannedExpenseCategoryBar
                  :category-parts="plannedBarResult.categoryParts"
                  :unallocated-bar-pct="plannedBarResult.unallocatedBarPct"
                  empty-hint="Add planned lines, unexpected expenses, or goal savings to see your budget mix here."
                />
          </template>
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          title="Top goals"
          meta="Up to three dashboard goals by priority"
          :default-expanded="false"
          storage-key="dashboard-top-goals"
          :card="true"
        >
          <div class="d-flex flex-wrap justify-content-end mb-3">
            <RouterLink to="/goals" class="btn btn-sm btn-outline-primary">
              Manage goals
            </RouterLink>
          </div>
          <p v-if="!activeGoals.length" class="dashboard-goals-empty small mb-0">
            No goals yet.
            <RouterLink to="/goals" class="dashboard-goals-link">Create a goal</RouterLink>
            so your biggest targets stay on the overview.
          </p>
          <div v-else class="dashboard-goals-grid">
              <article
                v-for="g in activeGoals"
                :key="g.id"
                class="dashboard-goal-tile"
              >
                <div class="dashboard-goal-tile__top">
                  <span class="dashboard-goal-tile__name">{{ g.name }}</span>
                  <span class="dashboard-goal-tile__badge" title="Priority (5 = first)">
                    P{{ g.priority }}
                  </span>
                </div>
                <div class="dashboard-goal-tile__amount-row">
                  <span
                    class="dashboard-goal-tile__saved"
                    :class="{ 'dashboard-goal-tile__saved--matched': goalSavingMatchedTarget(g) }"
                  >
                    {{ formatGoalMoney(savedTowardGoal(g.id)) }}
                  </span>
                  <span class="dashboard-goal-tile__target-sep text-muted">/</span>
                  <span class="dashboard-goal-tile__target">{{
                    formatGoalMoney(g.targetAmount)
                  }}</span>
                </div>
                <div class="dashboard-goal-tile__progress mt-2">
                  <div class="progress dashboard-goal-tile__progress-bar" style="height: 5px">
                    <div
                      class="progress-bar"
                      :class="goalSavingMatchedTarget(g) ? 'bg-success' : 'bg-primary'"
                      role="progressbar"
                      :style="{ width: goalProgressPctForBar(g) + '%' }"
                      :aria-valuenow="Math.round(goalProgressPctForBar(g))"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    />
                  </div>
                  <div
                    class="dashboard-goal-tile__pct small mt-1"
                    :class="goalSavingMatchedTarget(g) ? 'text-success' : 'text-muted'"
                  >
                    {{ goalProgressPctForBar(g).toFixed(0) }}% toward target
                    <span
                      v-if="
                        goalPlanThisMonthOnDashboard(g) > 0 &&
                        savedTowardGoal(g.id) + 1e-9 < g.targetAmount
                      "
                      class="d-block text-muted"
                    >
                      {{ goalProgressPctRecorded(g).toFixed(0) }}% recorded; bar includes linked plan
                    </span>
                  </div>
                </div>
                <div v-if="formatGoalDate(g.targetDate)" class="dashboard-goal-tile__date">
                  by {{ formatGoalDate(g.targetDate) }}
                </div>
              </article>
            </div>
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          title="Recent activity"
          :meta="recentTransactions.length ? `${recentTransactions.length} recent` : 'No activity yet'"
          :default-expanded="false"
          storage-key="dashboard-recent-activity"
        >
            <p v-if="!recentTransactions.length" class="small mb-0">
              No recent transactions yet. Import CSV or add activity to see it here.
            </p>
            <ul v-else class="list-unstyled mb-0 dashboard-activity-list">
              <li
                v-for="tx in recentTransactions"
                :key="tx.id"
                class="dashboard-activity-row"
              >
                <div>
                  <div class="dashboard-activity-row__title">{{ formatTxTitle(tx) }}</div>
                  <div class="small text-muted dashboard-activity-row__meta">
                    <span>{{ tx.date }}</span>
                    <span class="dashboard-activity-row__dot" aria-hidden="true">·</span>
                    <span
                      class="dashboard-activity-row__kind"
                      :class="activityKindClass(tx)"
                    >
                      {{ activityKindLabel(tx) }}
                    </span>
                    <span v-if="activityKindDetail(tx)" class="dashboard-activity-row__detail">
                      · {{ activityKindDetail(tx) }}
                    </span>
                  </div>
                </div>
                <div class="text-end">
                  <div class="dashboard-activity-row__amt">{{ tx.amount.toFixed(2) }}</div>
                </div>
              </li>
            </ul>
        </CollapsibleSection>
      </div>
    </div>
  </div>
</template>
