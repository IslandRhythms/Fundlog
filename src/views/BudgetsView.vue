<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import type { BudgetCategory, BudgetSubcategory } from '../shared/types';

const domain = useDomainStore();
const name = ref('');
const startMonth = ref('');
const monthlyIncome = ref<number | null>(null);
const ruleSet = ref<'fiftyThirtyTwenty' | 'custom'>('fiftyThirtyTwenty');
const showForm = ref(false);

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const editingCategoryId = ref<number | null>(null);
const newLabel = ref('');
const newType = ref<'fixed' | 'variable'>('fixed');
const newTargetPercent = ref<number | null>(null);
const newTargetAmount = ref<number | null>(null);
const newMinAmount = ref<number | null>(null);
const newMaxAmount = ref<number | null>(null);

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await loadCategories();
});

const budgets = computed(() =>
  [...domain.budgets].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

const activeBudget = computed(() => domain.activeBudget);

function formatFiftyThirtyTwentyAmount(income: number, percent: number) {
  const value = (income * percent) / 100;
  return value.toLocaleString();
}

async function submit() {
  if (!name.value || !startMonth.value || !monthlyIncome.value) return;
  await domain.createBudget({
    name: name.value.trim(),
    startMonth: startMonth.value,
    monthlyIncome: monthlyIncome.value,
    ruleSet: ruleSet.value,
  });
  name.value = '';
  startMonth.value = '';
  monthlyIncome.value = null;
  ruleSet.value = 'fiftyThirtyTwenty';
  await loadCategories();
}

async function loadCategories() {
  if (!activeBudget.value) return;
  const result = await (window as any).fundlog.category.listByBudget(activeBudget.value.id);
  categories.value = result.categories;
  subcategories.value = result.subcategories;
}

const groupedSubcategories = computed(() => {
  const grouped: Record<number, BudgetSubcategory[]> = {};
  for (const sub of subcategories.value) {
    const parentId = sub.parentCategoryId ?? 0;
    if (!grouped[parentId]) grouped[parentId] = [];
    grouped[parentId].push(sub);
  }
  return grouped;
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

const percentOfBudget = (sub: BudgetSubcategory) => {
  if (!activeBudget.value || !activeBudget.value.monthlyIncome) return 0;
  const income = activeBudget.value.monthlyIncome;
  const amt = plannedAmount(sub);
  if (!amt) return 0;
  return Math.min(100, (amt / income) * 100);
};

const totalPlanned = computed(() =>
  subcategories.value.reduce((sum, sub) => sum + plannedAmount(sub), 0),
);

const totalPercent = computed(() => {
  if (!activeBudget.value || !activeBudget.value.monthlyIncome || !totalPlanned.value) return 0;
  return Math.min(100, (totalPlanned.value / activeBudget.value.monthlyIncome) * 100);
});

function startAddFor(categoryId: number) {
  editingCategoryId.value = categoryId;
  newLabel.value = '';
  newType.value = 'fixed';
  newTargetPercent.value = null;
  newTargetAmount.value = null;
  newMinAmount.value = null;
  newMaxAmount.value = null;
}

async function submitSubcategory(category: BudgetCategory) {
  if (!activeBudget.value || !newLabel.value.trim()) return;
  const result = await (window as any).fundlog.subcategory.create({
    budgetId: activeBudget.value.id,
    parentCategoryId: category.id,
    label: newLabel.value.trim(),
    targetPercent: newTargetPercent.value,
    targetAmount: newType.value === 'fixed' ? newTargetAmount.value : null,
    minAmount: newType.value === 'variable' ? newMinAmount.value : null,
    maxAmount: newType.value === 'variable' ? newMaxAmount.value : null,
    isFlexible: newType.value === 'variable',
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  editingCategoryId.value = null;
}

async function updateCategoryColor(cat: BudgetCategory, color: string) {
  if (!activeBudget.value) return;
  const result = await (window as any).fundlog.category.updateColor({
    id: cat.id,
    color,
    budgetId: activeBudget.value.id,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Budgets</h2>
    <p class="view-subtitle mb-4">
      Create separate budgets and choose the 50/30/20 rule or a custom structure.
    </p>
    <div class="row g-3">
      <div class="col-12">
        <section class="card card-list stacked-section h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Existing budgets</h3>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                data-bs-toggle="modal"
                data-bs-target="#createBudgetModal"
              >
                New budget
              </button>
            </div>
            <div v-if="budgets.length === 0" class="alert alert-info mt-3">
              No budgets yet. Create your first budget to get started.
            </div>
            <ul v-else class="list-unstyled mt-3">
              <li v-for="b in budgets" :key="b.id" class="mb-2">
                <div class="d-flex flex-column border rounded p-2 bg-dark bg-opacity-50">
                  <div class="d-flex align-items-center mb-1">
                    <span class="fw-semibold me-2">{{ b.name }}</span>
                    <span v-if="b.isActive" class="badge bg-success">Active</span>
                  </div>
                  <div class="small text-muted d-flex flex-wrap gap-2">
                    <span>From {{ b.startMonth }}</span>
                    <span>Income {{ b.monthlyIncome.toLocaleString() }}</span>
                      <span v-if="b.ruleSet === 'fiftyThirtyTwenty'">
                        50 / 30 / 20
                        ({{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 50) }} /
                        {{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 30) }} /
                        {{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 20) }})
                      </span>
                      <span v-else>Custom</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <div v-if="activeBudget" class="row g-3 mt-3">
      <div class="col-12">
        <section class="card">
          <div class="card-body">
            <h3 class="h5 card-title mb-2">
              Planned expenses for {{ activeBudget.name }}
            </h3>
            <p class="small text-muted mb-2">
              Configure fixed and variable expenses within each category of this budget.
            </p>
            <div class="mb-1 d-flex justify-content-between small">
              <span>Total planned</span>
              <span>
                {{ totalPlanned.toLocaleString() }}
                ({{ totalPercent.toFixed(1) }}% of income)
              </span>
            </div>
            <div class="progress mb-0" style="height: 6px">
              <div
                class="progress-bar"
                role="progressbar"
                :style="{ width: totalPercent + '%' }"
                :aria-valuenow="totalPercent"
                aria-valuemin="0"
                aria-valuemax="100"
              />
            </div>
          </div>
        </section>
      </div>

      <div
        v-for="cat in categories"
        :key="cat.id"
        class="col-lg-4"
      >
        <section class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h6 card-title mb-0">
                {{ cat.label }}
              </h3>
              <input
                type="color"
                class="form-control form-control-color form-control-sm"
                :value="cat.color"
                title="Pick category color"
                @input="updateCategoryColor(cat, ($event.target as HTMLInputElement).value)"
              />
              <span class="badge rounded-pill bg-primary">
                {{ cat.targetPercent }}%
              </span>
            </div>
            <p class="small text-muted">
              Allocate fixed and flexible expenses within this category.
            </p>

            <ul class="list-unstyled mt-3 mb-3">
              <li
                v-for="sub in groupedSubcategories[cat.id] || []"
                :key="sub.id"
                class="mb-2"
              >
                <div
                  class="d-flex flex-column border rounded p-2 expense-item"
                  :style="{ borderLeft: '4px solid ' + cat.color }"
                >
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-semibold">{{ sub.label }}</span>
                    <span class="badge bg-secondary">
                      {{ sub.isFlexible ? 'Variable' : 'Fixed' }}
                    </span>
                  </div>
                  <div class="small text-muted d-flex flex-wrap gap-2">
                    <span v-if="sub.targetPercent != null">
                      Target {{ sub.targetPercent }}%
                    </span>
                    <span v-if="!sub.isFlexible && sub.targetAmount != null">
                      Fixed {{ sub.targetAmount.toLocaleString() }}
                    </span>
                    <span v-if="sub.isFlexible && (sub.minAmount != null || sub.maxAmount != null)">
                      Range
                      <template v-if="sub.minAmount != null">
                        {{ sub.minAmount.toLocaleString() }}
                      </template>
                      –
                      <template v-if="sub.maxAmount != null">
                        {{ sub.maxAmount.toLocaleString() }}
                      </template>
                    </span>
                  </div>
                  <div class="mt-2">
                    <div class="d-flex justify-content-between small mb-1">
                      <span>
                        {{ plannedAmount(sub).toLocaleString() }}
                      </span>
                      <span>{{ percentOfBudget(sub).toFixed(1) }}% of budget</span>
                    </div>
                    <div class="progress" style="height: 6px">
                      <div
                        class="progress-bar"
                        role="progressbar"
                        :style="{ width: percentOfBudget(sub) + '%' }"
                        :aria-valuenow="percentOfBudget(sub)"
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>
                </div>
              </li>
              <li v-if="!(groupedSubcategories[cat.id] || []).length" class="small text-muted">
                No subcategories yet. You can subdivide this bucket into specific expenses.
              </li>
            </ul>

            <button
              type="button"
              class="btn btn-sm btn-outline-primary w-100 mb-2"
              @click="startAddFor(cat.id)"
            >
              Add expense / subcategory
            </button>

            <form
              v-if="editingCategoryId === cat.id"
              class="row g-2 mt-1"
              @submit.prevent="submitSubcategory(cat)"
            >
              <div class="col-12">
                <label class="form-label mb-1">
                  Name
                  <input
                    v-model="newLabel"
                    type="text"
                    class="form-control form-control-sm"
                    placeholder="Rent, groceries, etc."
                  />
                </label>
              </div>
              <div class="col-6">
                <label class="form-label mb-1">
                  Type
                  <select v-model="newType" class="form-select form-select-sm">
                    <option value="fixed">Fixed</option>
                    <option value="variable">Variable</option>
                  </select>
                </label>
              </div>
              <div class="col-6">
                <label class="form-label mb-1">
                  Target %
                  <input
                    v-model.number="newTargetPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    class="form-control form-control-sm"
                    placeholder="e.g. 10"
                  />
                </label>
              </div>
              <div class="col-12" v-if="newType === 'fixed'">
                <label class="form-label mb-1">
                  Amount
                  <input
                    v-model.number="newTargetAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control form-control-sm"
                    placeholder="e.g. 250"
                  />
                </label>
              </div>
              <div class="col-6" v-if="newType === 'variable'">
                <label class="form-label mb-1">
                  Min amount
                  <input
                    v-model.number="newMinAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control form-control-sm"
                    placeholder="e.g. 100"
                  />
                </label>
              </div>
              <div class="col-6" v-if="newType === 'variable'">
                <label class="form-label mb-1">
                  Max amount
                  <input
                    v-model.number="newMaxAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control form-control-sm"
                    placeholder="e.g. 300"
                  />
                </label>
              </div>
              <div class="col-12 d-flex justify-content-end gap-2">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  @click="editingCategoryId = null"
                >
                  Cancel
                </button>
                <button type="submit" class="btn btn-sm btn-success">
                  Save
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="createBudgetModal"
    tabindex="-1"
    aria-labelledby="createBudgetModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createBudgetModalLabel">Create budget</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submit">
          <div class="modal-body row g-3">
            <div class="col-12">
              <label class="form-label">
                Name
                <input v-model="name" type="text" class="form-control" placeholder="Primary budget" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Start month
                <input v-model="startMonth" type="month" class="form-control" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Monthly income
                <input
                  v-model.number="monthlyIncome"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  placeholder="4000"
                />
              </label>
            </div>
            <div class="col-12">
              <label class="form-label">
                Rule set
                <select v-model="ruleSet" class="form-select">
                  <option value="fiftyThirtyTwenty">50 / 30 / 20</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button class="btn btn-success" type="submit">
              Save budget
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

