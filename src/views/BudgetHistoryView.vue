<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import {
  computeBudgetMonthPerformance,
  formatCalendarMonthLabel,
  historicalMonthsForBudget,
  type BudgetMonthPerformance,
} from '../shared/budgetMonthHistory';
import { calendarMonthNow } from '../shared/calendarMonth';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import type { Budget, BudgetSubcategory, Profile, Transaction } from '../shared/types';

const domain = useDomainStore();

const loading = ref(false);
const selectedBudgetId = ref<number | null>(null);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpected = ref<Transaction[]>([]);
const purchases = ref<Transaction[]>([]);
const goalContributions = ref<Transaction[]>([]);

const nowMonth = calendarMonthNow();

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const profileBudgets = computed(() =>
  [...domain.budgets].sort((a, b) => b.startMonth.localeCompare(a.startMonth)),
);

const selectedBudget = computed(() => {
  const id = selectedBudgetId.value;
  if (id == null) return null;
  return profileBudgets.value.find((b) => b.id === id) ?? null;
});

const monthRows = computed((): BudgetMonthPerformance[] => {
  const budget = selectedBudget.value;
  if (!budget) return [];

  const months = historicalMonthsForBudget(budget, nowMonth);
  return months
    .map((month) =>
      computeBudgetMonthPerformance(
        month,
        subcategories.value,
        unexpected.value,
        purchases.value,
        goalContributions.value,
        domain.effectiveMonthlyIncomeFor(budget.id, month),
      ),
    )
    .reverse();
});

const overMonthCount = computed(
  () => monthRows.value.filter((row) => row.isOverCommitted).length,
);

const onTrackMonthCount = computed(
  () => monthRows.value.filter((row) => !row.isOverCommitted && row.committed > 0).length,
);

function formatMoney(amount: number) {
  return formatMoneyExact(amount, activeProfile.value?.currencyCode ?? 'USD');
}

function performanceStatus(row: BudgetMonthPerformance): string {
  if (row.isOverCommitted) return 'Over income';
  if (row.committed <= 0) return 'No activity';
  if (row.moneyLeft > 0) return 'Under budget';
  return 'Fully allocated';
}

function performanceStatusClass(row: BudgetMonthPerformance): string {
  if (row.isOverCommitted) return 'budget-history-pill--over';
  if (row.committed <= 0) return 'budget-history-pill--quiet';
  if (row.moneyLeft > 0) return 'budget-history-pill--good';
  return 'budget-history-pill--tight';
}

async function loadBudgetData(budgetId: number) {
  if (!domain.activeProfileId) return;
  loading.value = true;
  try {
    const catsResult = await window.fundlog.category.listByBudget(budgetId);
    subcategories.value = catsResult.subcategories;
    const [tx, purchaseTx, goalTx] = await Promise.all([
      window.fundlog.transaction.listUnexpected(domain.activeProfileId, budgetId),
      window.fundlog.transaction.listPurchases(domain.activeProfileId, budgetId),
      window.fundlog.transaction.listGoalContributions(domain.activeProfileId, budgetId),
    ]);
    unexpected.value = tx;
    purchases.value = purchaseTx;
    goalContributions.value = goalTx;
  } finally {
    loading.value = false;
  }
}

watch(
  selectedBudgetId,
  async (id) => {
    if (id == null) {
      subcategories.value = [];
      unexpected.value = [];
      purchases.value = [];
      goalContributions.value = [];
      return;
    }
    await loadBudgetData(id);
  },
  { immediate: true },
);

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  if (selectedBudgetId.value == null) {
    selectedBudgetId.value =
      domain.activeBudgetId ??
      profileBudgets.value.find((b) => b.isActive)?.id ??
      profileBudgets.value[0]?.id ??
      null;
  }
});
</script>

<template>
  <div class="view view-budget-history budget-history-view container-fluid">
    <p class="view-page-eyebrow mb-1">Archive</p>
    <h2 class="mb-2">Budget History</h2>
    <p class="view-subtitle mb-4">
      Month-by-month performance for each budget — how planned spending, purchases, unexpected
      costs, and goal savings compared to that month’s effective income. Unlike
      <RouterLink to="/budget-records">Budget Records</RouterLink>, this is per calendar month,
      not lifetime totals.
    </p>

    <p v-if="!domain.activeProfileId" class="status-text">
      Create a profile in Settings first.
    </p>

    <template v-else-if="!profileBudgets.length">
      <div class="budget-history-empty-hint">
        <p class="budget-history-empty-title">No budgets yet</p>
        <p class="budget-history-empty-muted mb-0">
          Create a budget on <strong>Budgets</strong> to see monthly performance here after your
          first completed month.
        </p>
      </div>
    </template>

    <template v-else>
      <div class="budget-history-toolbar mb-3">
        <label class="budget-history-select-label">
          Budget
          <select v-model.number="selectedBudgetId" class="form-select form-select-sm">
            <option v-for="b in profileBudgets" :key="b.id" :value="b.id">
              {{ b.name }}
              <template v-if="b.isActive"> (active)</template>
            </option>
          </select>
        </label>
        <p v-if="selectedBudget" class="budget-history-toolbar__period small text-muted mb-0">
          {{ selectedBudget.startMonth }}
          →
          {{ selectedBudget.endMonth || 'Open' }}
          · completed months only
        </p>
      </div>

      <div v-if="loading" class="budget-history-loading">
        <LoadingView message="Loading monthly history…" />
      </div>

      <div v-else-if="!monthRows.length" class="budget-history-empty-hint">
        <p class="budget-history-empty-title">No completed months yet</p>
        <p class="budget-history-empty-muted mb-0">
          History appears after a full calendar month ends. Check
          <RouterLink to="/expenses">Expenses</RouterLink>
          or <RouterLink to="/dashboard">Dashboard</RouterLink> for the current month.
        </p>
      </div>

      <template v-else>
        <div class="budget-history-summary mb-3">
          <div class="budget-history-summary__stat">
            <span class="budget-history-summary__label">Months</span>
            <span class="budget-history-summary__value">{{ monthRows.length }}</span>
          </div>
          <div class="budget-history-summary__stat budget-history-summary__stat--good">
            <span class="budget-history-summary__label">On track</span>
            <span class="budget-history-summary__value">{{ onTrackMonthCount }}</span>
          </div>
          <div class="budget-history-summary__stat budget-history-summary__stat--over">
            <span class="budget-history-summary__label">Over income</span>
            <span class="budget-history-summary__value">{{ overMonthCount }}</span>
          </div>
        </div>

        <div class="budget-history-panel">
          <div class="table-responsive budget-history-table-scroll">
            <table class="table budget-history-table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" class="text-end">Income</th>
                  <th scope="col" class="text-end">Planned</th>
                  <th scope="col" class="text-end">Purchases</th>
                  <th scope="col" class="text-end">Unexpected</th>
                  <th scope="col" class="text-end">Goals</th>
                  <th scope="col" class="text-end">Total</th>
                  <th scope="col" class="text-end">Left</th>
                  <th scope="col" class="text-end">Used</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in monthRows"
                  :key="row.month"
                  :class="{ 'budget-history-row--over': row.isOverCommitted }"
                >
                  <td class="budget-history-month">
                    {{ formatCalendarMonthLabel(row.month) }}
                  </td>
                  <td class="budget-history-num">{{ formatMoney(row.income) }}</td>
                  <td class="budget-history-num budget-history-subtle">
                    {{ formatMoney(row.planned) }}
                  </td>
                  <td class="budget-history-num budget-history-num--purchase">
                    {{ formatMoney(row.purchases) }}
                  </td>
                  <td class="budget-history-num budget-history-num--unexpected">
                    {{ formatMoney(row.unexpected) }}
                  </td>
                  <td class="budget-history-num budget-history-num--goal">
                    {{ formatMoney(row.goalSavings) }}
                  </td>
                  <td class="budget-history-num budget-history-num--total">
                    {{ formatMoney(row.committed) }}
                  </td>
                  <td
                    class="budget-history-num"
                    :class="row.moneyLeft < 0 ? 'budget-history-num--over' : 'budget-history-num--left'"
                  >
                    {{ formatMoney(row.moneyLeft) }}
                  </td>
                  <td class="budget-history-num budget-history-subtle">
                    {{ formatPercent(row.usedPct) }}%
                  </td>
                  <td>
                    <span
                      class="budget-history-pill"
                      :class="performanceStatusClass(row)"
                    >
                      {{ performanceStatus(row) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="small mt-3 mb-0 budget-history-caption">
          Amounts use each transaction’s monthly spread and line-item plans active today. Past
          months before a budget change may not reflect the plan you had at the time.
        </p>
      </template>
    </template>
  </div>
</template>
