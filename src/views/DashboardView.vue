<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import CategoryPieChart from '../components/CategoryPieChart.vue';
import type { BudgetCategory, BudgetSubcategory } from '../shared/types';

const domain = useDomainStore();

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const loading = ref(false);

const activeBudget = computed(() => domain.activeBudget);
const goals = computed(() => domain.goals);
const transactions = computed(() => domain.transactions);

async function loadCategories() {
  if (!activeBudget.value) return;
  loading.value = true;
  try {
    const result = await (window as any).fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = result.categories;
    subcategories.value = result.subcategories;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await domain.loadGoals();
  await domain.loadTransactions();
  await loadCategories();
});

const splitCategories = computed(() => categories.value);

const monthlyIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

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

const totalPercent = computed(() => {
  if (!monthlyIncome.value || !totalPlanned.value) return 0;
  return Math.min(100, (totalPlanned.value / monthlyIncome.value) * 100);
});

const recentTransactions = computed(() => transactions.value.slice(0, 5));

function formatTxTitle(tx: Transaction) {
  const base = (tx.description || tx.merchant || '—').trim();
  if (base.length <= 40) return base;
  return `${base.slice(0, 37)}...`;
}

const activeGoals = computed(() =>
  [...goals.value].sort((a, b) => b.priority - a.priority).slice(0, 3),
);
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Dashboard</h2>
    <p class="view-subtitle mb-4">
      Overview of your current budget, planned expenses, and goals.
    </p>

    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title mb-3">Budget overview</h3>
            <p v-if="!activeBudget" class="mb-0 text-muted">
              Create a budget to see your allocation and expenses here.
            </p>
            <template v-else>
              <p class="mb-1">
                <strong>{{ activeBudget.name }}</strong>
                <span class="text-muted">
                  (from {{ activeBudget.startMonth }})
                </span>
              </p>
              <p class="small text-muted mb-2">
                Monthly income {{ monthlyIncome.toLocaleString() }}
              </p>

              <div class="mb-3">
                <div class="d-flex justify-content-between small mb-1">
                  <span>Planned expenses</span>
                  <span>
                    {{ totalPlanned.toLocaleString() }}
                    ({{ totalPercent.toFixed(1) }}%)
                  </span>
                </div>
                <div class="progress" style="height: 8px">
                  <div
                    class="progress-bar bg-warning"
                    role="progressbar"
                    :style="{ width: totalPercent + '%' }"
                    :aria-valuenow="totalPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
              </div>

              <div v-if="splitCategories.length" class="mb-3">
                <div class="d-flex justify-content-between small mb-1">
                  <span>Rule allocation</span>
                  <span>100%</span>
                </div>
                <div class="progress" style="height: 8px">
                  <div
                    v-for="cat in splitCategories"
                    :key="cat.id"
                    class="progress-bar"
                    role="progressbar"
                    :style="{
                      width: cat.targetPercent + '%',
                      backgroundColor: cat.color,
                    }"
                    :aria-valuenow="cat.targetPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
                <div class="d-flex flex-wrap gap-2 mt-2 small">
                  <div
                    v-for="cat in splitCategories"
                    :key="cat.id"
                    class="d-flex align-items-center gap-1"
                  >
                    <span
                      class="rounded-circle"
                      :style="{
                        width: '10px',
                        height: '10px',
                        display: 'inline-block',
                        backgroundColor: cat.color,
                      }"
                    />
                    <span>
                      {{ cat.label }} ({{ cat.targetPercent }}%)
                    </span>
                  </div>
                </div>
              </div>

              <h4 class="h6 card-title mt-3 mb-2">50 / 30 / 20 allocation</h4>
              <CategoryPieChart
                v-if="splitCategories.length"
                :categories="splitCategories"
              />
              <p v-else class="small text-muted mb-0">
                Categories will appear here once expenses are configured for this budget.
              </p>
            </template>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-body d-flex flex-column gap-3">
            <div>
              <h3 class="h5 card-title mb-2">Recent activity</h3>
              <p v-if="!recentTransactions.length" class="small text-muted mb-0">
                No recent transactions yet. Import CSV or add activity to see it here.
              </p>
              <ul v-else class="list-unstyled mb-0 small">
                <li
                  v-for="tx in recentTransactions"
                  :key="tx.id"
                  class="d-flex justify-content-between border-bottom py-1"
                >
                  <div>
                    <div>{{ formatTxTitle(tx) }}</div>
                    <div class="text-muted">
                      {{ tx.date }}
                    </div>
                  </div>
                  <div class="text-end">
                    <div>{{ tx.amount.toFixed(2) }}</div>
                    <div class="text-muted">{{ tx.source }}</div>
                  </div>
                </li>
              </ul>
            </div>

            <div>
              <h3 class="h5 card-title mb-2">Top goals</h3>
              <p v-if="!activeGoals.length" class="small text-muted mb-0">
                No goals yet. Create a goal to start tracking progress.
              </p>
              <ul v-else class="list-unstyled mb-0 small">
                <li
                  v-for="g in activeGoals"
                  :key="g.id"
                  class="mb-2"
                >
                  <div class="d-flex justify-content-between">
                    <span class="fw-semibold">{{ g.name }}</span>
                    <span class="badge bg-success">Priority {{ g.priority }}</span>
                  </div>
                  <div class="text-muted">
                    Target {{ g.targetAmount.toLocaleString() }}
                    <span v-if="g.targetDate"> · by {{ g.targetDate }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
