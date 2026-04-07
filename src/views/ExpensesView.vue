<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import UnexpectedExpensesBarChart from '../components/UnexpectedExpensesBarChart.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import { calendarMonthNow } from '../shared/calendarMonth';
import type { BudgetCategory, BudgetSubcategory, Goal, Transaction } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const loading = ref(false);
const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpected = ref<Transaction[]>([]);
const goalContributions = ref<Transaction[]>([]);
const amount = ref<number | null>(null);
const categoryId = ref<number | null>(null);
const label = ref('');
const barMetric = ref<'amount' | 'count'>('amount');

const activeBudget = computed(() => domain.activeBudget);

async function loadData() {
  if (!activeBudget.value || !domain.activeProfileId) return;
  loading.value = true;
  try {
    const catsResult = await (window as any).fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = catsResult.categories;
    subcategories.value = catsResult.subcategories;
    const [tx, goalTx] = await Promise.all([
      window.fundlog.transaction.listUnexpected(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
      window.fundlog.transaction.listGoalContributions(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
    ]);
    unexpected.value = tx;
    goalContributions.value = goalTx;
  } finally {
    loading.value = false;
  }
}

const categoryById = computed(() => {
  const map: Record<number, BudgetCategory> = {};
  for (const c of categories.value) {
    map[c.id] = c;
  }
  return map;
});

const subcategoryById = computed(() => {
  const map: Record<number, BudgetSubcategory> = {};
  for (const s of subcategories.value) {
    map[s.id] = s;
  }
  return map;
});

function firstSubcategoryIdForCategory(catId: number): number | null {
  const subs = subcategories.value
    .filter((s) => s.parentCategoryId === catId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return subs[0]?.id ?? null;
}

function parentCategoryForSubcategory(subId: number | null): BudgetCategory | null {
  if (subId == null) return null;
  const sub = subcategoryById.value[subId];
  const pid = sub?.parentCategoryId;
  if (pid == null) return null;
  return categoryById.value[pid] ?? null;
}

const totalUnexpected = computed(() =>
  unexpected.value.reduce((sum, tx) => sum + tx.amount, 0),
);

const mostCommonCategory = computed(() => {
  const counts: Record<number, number> = {};
  for (const tx of unexpected.value) {
    if (tx.subcategoryId == null) continue;
    const sub = subcategoryById.value[tx.subcategoryId];
    const parentId = sub?.parentCategoryId;
    if (parentId == null) continue;
    counts[parentId] = (counts[parentId] ?? 0) + 1;
  }
  let bestId: number | null = null;
  let bestCount = 0;
  for (const [idStr, count] of Object.entries(counts)) {
    const id = Number(idStr);
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  return bestId != null ? categoryById.value[bestId] : null;
});

/** Per parent category: where unexpected expenses land (all recorded manual entries for this budget). */
const unexpectedBarSegments = computed(() => {
  const totals: Record<number, { amount: number; count: number }> = {};
  let uncAmount = 0;
  let uncCount = 0;

  for (const tx of unexpected.value) {
    const cat = parentCategoryForSubcategory(tx.subcategoryId);
    if (!cat) {
      uncAmount += tx.amount;
      uncCount += 1;
      continue;
    }
    const cur = totals[cat.id] ?? { amount: 0, count: 0 };
    cur.amount += tx.amount;
    cur.count += 1;
    totals[cat.id] = cur;
  }

  const rows = categories.value.map((c) => ({
    label: c.label,
    color: c.color,
    amount: totals[c.id]?.amount ?? 0,
    count: totals[c.id]?.count ?? 0,
  }));

  if (uncAmount > 0 || uncCount > 0) {
    rows.push({
      label: 'Uncategorized',
      color: '#6b7280',
      amount: uncAmount,
      count: uncCount,
    });
  }

  return rows;
});

const recentUnexpected = computed(() => unexpected.value.slice(0, 10));

const baseBudgetIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const budgetIncome = computed(() => {
  const b = activeBudget.value;
  if (!b) return 0;
  return domain.effectiveMonthlyIncomeFor(b.id, calendarMonthNow());
});

const monthIncomeBoost = computed(() =>
  Math.max(0, budgetIncome.value - baseBudgetIncome.value),
);

const unexpectedPercent = computed(() => {
  if (!budgetIncome.value || !totalUnexpected.value) return 0;
  return Math.min(100, (totalUnexpected.value / budgetIncome.value) * 100);
});

const goalById = computed(() => {
  const m = new Map<number, Goal>();
  for (const g of domain.goals) {
    m.set(g.id, g);
  }
  return m;
});

const totalGoalSavingsRecorded = computed(() =>
  goalContributions.value.reduce((sum, tx) => sum + tx.amount, 0),
);

const goalSavingsPercent = computed(() => {
  if (!budgetIncome.value || !totalGoalSavingsRecorded.value) return 0;
  return Math.min(100, (totalGoalSavingsRecorded.value / budgetIncome.value) * 100);
});

const recentGoalContributions = computed(() => goalContributions.value.slice(0, 10));

const plannedAmount = (sub: BudgetSubcategory) => {
  if (!sub.isFlexible && sub.targetAmount != null) {
    return sub.targetAmount;
  }
  if (sub.isFlexible && (sub.maxAmount != null || sub.minAmount != null)) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    return (min + max) / 2;
  }
  return 0;
};

const totalPlanned = computed(() =>
  subcategories.value.reduce((sum, sub) => sum + plannedAmount(sub), 0),
);

const plannedPercent = computed(() => {
  if (!budgetIncome.value || !totalPlanned.value) return 0;
  return Math.min(100, (totalPlanned.value / budgetIncome.value) * 100);
});

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await domain.loadGoals();
  await loadData();
});

async function addUnexpected() {
  if (
    !activeBudget.value ||
    !domain.activeProfileId ||
    !amount.value ||
    !categoryId.value ||
    !label.value.trim()
  )
    return;
  const subcategoryId = firstSubcategoryIdForCategory(categoryId.value);
  if (subcategoryId == null) {
    toast.error('Add at least one line item under this category on Budgets first.');
    return;
  }
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  try {
    await (window as any).fundlog.transaction.createManual({
      profileId: domain.activeProfileId,
      budgetId: activeBudget.value.id,
      subcategoryId,
      date,
      amount: amount.value,
      description: label.value.trim(),
    });
    amount.value = null;
    categoryId.value = null;
    label.value = '';
    await loadData();
    hideBsModal('addUnexpectedModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not add expense.');
  }
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Expenses</h2>
    <p class="view-subtitle mb-4">
      Track unexpected expenses and goal savings against your plan. Summary percentages use your
      active budget’s effective income for
      <strong>this calendar month</strong> (see
      <RouterLink to="/extra-income">Extra income</RouterLink>
      for one-off bumps). Goal savings use the same income basis and appear on
      <RouterLink to="/budgets">Budgets</RouterLink>
      and
      <RouterLink to="/dashboard">Dashboard</RouterLink>
      like unexpected spending.
    </p>
    <p v-if="activeBudget && monthIncomeBoost > 0" class="small text-muted mb-3">
      This month includes {{ monthIncomeBoost.toLocaleString() }} extra on top of the budget base.
    </p>

    <p v-if="!activeBudget" class="status-text">
      Create and select a budget first to record expenses.
    </p>

    <LoadingView v-else-if="loading" message="Loading expenses…" />

    <div v-else class="row g-3">
      <div class="col-12 col-lg-6">
        <section class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Unexpected expense summary</h3>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                data-bs-toggle="modal"
                data-bs-target="#addUnexpectedModal"
              >
                Add unexpected expense
              </button>
            </div>
            <p v-if="!unexpected.length" class="small text-muted mb-3">
              No unexpected expenses recorded yet.
            </p>
            <div v-else class="mb-3">
              <p class="mb-1 small">
                Planned (from budget):
                <strong>{{ totalPlanned.toLocaleString() }}</strong>
                ({{ plannedPercent.toFixed(1) }}% of budget)
              </p>
              <p class="mb-1 small">
                Unexpected:
                <strong>{{ totalUnexpected.toLocaleString() }}</strong>
                ({{ unexpectedPercent.toFixed(1) }}% of budget)
              </p>
              <div class="progress mt-2" style="height: 6px">
                <div
                  class="progress-bar bg-primary"
                  role="progressbar"
                  :style="{ width: plannedPercent + '%' }"
                  :aria-valuenow="plannedPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
                <div
                  class="progress-bar bg-danger"
                  role="progressbar"
                  :style="{ width: unexpectedPercent + '%' }"
                  :aria-valuenow="unexpectedPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
              <p v-if="mostCommonCategory" class="mb-0 small">
                Most frequent category:
                <strong>{{ mostCommonCategory.label }}</strong>
              </p>
            </div>

            <div v-if="unexpected.length" class="mt-4 pt-3 border-top">
              <h4 class="h6 card-title mb-2">Unexpected expenses by category</h4>
              <p class="small text-muted mb-2">
                All manual unexpected entries on this budget, grouped by the category you chose when
                adding them.
              </p>
              <div
                class="btn-group btn-group-sm mb-3"
                role="group"
                aria-label="Bar chart metric"
              >
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  :class="{ active: barMetric === 'amount' }"
                  @click="barMetric = 'amount'"
                >
                  By amount
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  :class="{ active: barMetric === 'count' }"
                  @click="barMetric = 'count'"
                >
                  By count
                </button>
              </div>
              <UnexpectedExpensesBarChart
                :segments="unexpectedBarSegments"
                :metric="barMetric"
              />
            </div>

            <h4 class="h6 card-title mt-2 mb-2">Recent unexpected expenses</h4>
            <ul v-if="recentUnexpected.length" class="list-unstyled mb-0 small">
              <li
                v-for="tx in recentUnexpected"
                :key="tx.id"
                class="d-flex justify-content-between border-bottom py-1 unexpected-item"
                :style="{
                  borderLeft:
                    '4px solid ' +
                    (parentCategoryForSubcategory(tx.subcategoryId)?.color || '#6b7280'),
                }"
              >
                <div>
                  <div>{{ tx.description || 'Unexpected expense' }}</div>
                  <div class="text-muted">
                    {{ tx.date }}
                  </div>
                </div>
                <div class="text-end">
                  <div>{{ tx.amount.toFixed(2) }}</div>
                </div>
              </li>
            </ul>
            <p v-else class="small text-muted mb-0">
              No recent unexpected expenses.
            </p>
          </div>
        </section>
      </div>

      <div class="col-12 col-lg-6">
        <section class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Goal savings summary</h3>
              <RouterLink to="/goals" class="btn btn-sm btn-outline-success">Goals</RouterLink>
            </div>
            <p class="small text-muted mb-3">
              Amounts from <strong>Record savings</strong> on the Goals page. They map to your
              savings/debt category on budget bars (or a “Goal savings” segment if there is no savings
              category).
            </p>
            <p v-if="!goalContributions.length" class="small text-muted mb-0">
              No goal savings recorded on this budget yet.
            </p>
            <div v-else class="mb-0">
              <p class="mb-1 small">
                Planned (from budget):
                <strong>{{ totalPlanned.toLocaleString() }}</strong>
                ({{ plannedPercent.toFixed(1) }}% of budget)
              </p>
              <p class="mb-1 small">
                Unexpected:
                <strong>{{ totalUnexpected.toLocaleString() }}</strong>
                ({{ unexpectedPercent.toFixed(1) }}% of budget)
              </p>
              <p class="mb-1 small">
                Goal savings:
                <strong>{{ totalGoalSavingsRecorded.toLocaleString() }}</strong>
                ({{ goalSavingsPercent.toFixed(1) }}% of budget)
              </p>
              <div class="progress mt-2" style="height: 6px">
                <div
                  class="progress-bar bg-primary"
                  role="progressbar"
                  :style="{ width: plannedPercent + '%' }"
                  :aria-valuenow="plannedPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
                <div
                  class="progress-bar bg-danger"
                  role="progressbar"
                  :style="{ width: unexpectedPercent + '%' }"
                  :aria-valuenow="unexpectedPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
                <div
                  class="progress-bar bg-success"
                  role="progressbar"
                  :style="{ width: goalSavingsPercent + '%' }"
                  :aria-valuenow="goalSavingsPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
            </div>

            <h4 class="h6 card-title mt-4 pt-3 border-top mb-2">Recent goal savings</h4>
            <ul v-if="recentGoalContributions.length" class="list-unstyled mb-0 small">
              <li
                v-for="tx in recentGoalContributions"
                :key="tx.id"
                class="d-flex justify-content-between border-bottom py-1"
              >
                <div>
                  <div>{{ tx.description || 'Goal savings' }}</div>
                  <div class="text-muted">
                    {{ tx.date }}
                    <span v-if="tx.goalId != null && goalById.get(tx.goalId)">
                      · {{ goalById.get(tx.goalId)!.name }}
                    </span>
                  </div>
                </div>
                <div class="text-end">
                  <div>{{ tx.amount.toFixed(2) }}</div>
                </div>
              </li>
            </ul>
            <p v-else class="small text-muted mb-0">No recent goal savings.</p>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="addUnexpectedModal"
    tabindex="-1"
    aria-labelledby="addUnexpectedModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="addUnexpectedModalLabel">Add unexpected expense</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form class="row g-3" @submit.prevent="addUnexpected">
          <div class="modal-body row g-3">
            <div class="col-6">
              <label class="form-label">
                Amount
                <input
                  v-model.number="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  placeholder="e.g. 120.50"
                />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Category
                <select v-model="categoryId" class="form-select">
                  <option :value="null" disabled>Select category</option>
                  <option
                    v-for="cat in categories"
                    :key="cat.id"
                    :value="cat.id"
                  >
                    {{ cat.label }}
                  </option>
                </select>
              </label>
              <p class="form-text small mb-0">
                Stored on your first line item under this category (see Budgets).
              </p>
            </div>
            <div class="col-12">
              <label class="form-label">
                Label
                <input
                  v-model="label"
                  type="text"
                  class="form-control"
                  placeholder="Short description"
                />
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button class="btn btn-success" type="submit">
              Add expense
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

