<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import type { BudgetCategory, BudgetSubcategory, Transaction } from '../shared/types';

const domain = useDomainStore();

const loading = ref(false);
const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpected = ref<Transaction[]>([]);
const amount = ref<number | null>(null);
const categoryId = ref<number | null>(null);
const label = ref('');

const activeBudget = computed(() => domain.activeBudget);

async function loadData() {
  if (!activeBudget.value || !domain.activeProfileId) return;
  loading.value = true;
  try {
    const catsResult = await (window as any).fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = catsResult.categories;
    subcategories.value = catsResult.subcategories;
    const tx = await (window as any).fundlog.transaction.listUnexpected(
      domain.activeProfileId,
      activeBudget.value.id,
    );
    unexpected.value = tx;
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

const totalUnexpected = computed(() =>
  unexpected.value.reduce((sum, tx) => sum + tx.amount, 0),
);

const mostCommonCategory = computed(() => {
  const counts: Record<number, number> = {};
  for (const tx of unexpected.value) {
    if (tx.subcategoryId == null) continue;
    const catId = categoryById.value[tx.subcategoryId]?.id;
    if (!catId) continue;
    counts[catId] = (counts[catId] ?? 0) + 1;
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

const recentUnexpected = computed(() => unexpected.value.slice(0, 10));

const budgetIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const unexpectedPercent = computed(() => {
  if (!budgetIncome.value || !totalUnexpected.value) return 0;
  return Math.min(100, (totalUnexpected.value / budgetIncome.value) * 100);
});

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
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  await (window as any).fundlog.transaction.createManual({
    profileId: domain.activeProfileId,
    budgetId: activeBudget.value.id,
    subcategoryId: categoryId.value,
    date,
    amount: amount.value,
    description: label.value.trim(),
  });
  amount.value = null;
  categoryId.value = null;
  label.value = '';
  await loadData();
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Expenses</h2>
    <p class="view-subtitle mb-4">
      Track unexpected expenses and see which categories they impact most.
    </p>

    <p v-if="!activeBudget" class="status-text">
      Create and select a budget first to record expenses.
    </p>

    <div v-else class="row g-3">
      <div class="col-12">
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

            <h4 class="h6 card-title mt-2 mb-2">Recent unexpected expenses</h4>
            <ul v-if="recentUnexpected.length" class="list-unstyled mb-0 small">
              <li
                v-for="tx in recentUnexpected"
                :key="tx.id"
                class="d-flex justify-content-between border-bottom py-1 unexpected-item"
                :style="{
                  borderLeft: '4px solid ' + (categoryById[tx.subcategoryId || 0]?.color || '#6b7280'),
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
    </div>
  </div>
  <div
    class="modal fade"
    id="addUnexpectedModal"
    tabindex="-1"
    aria-labelledby="addUnexpectedModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
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

