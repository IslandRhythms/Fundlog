<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Modal } from 'bootstrap';
import { useToast } from 'vue-toastification';
import { useDomainStore } from '../stores/domain';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import {
  computePlannedExpenseBarSegments,
  plannedAmountFromSub,
} from '../shared/plannedExpenseBar';
import type { BudgetCategory, BudgetSubcategory, Transaction } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const existingBudgetsExpanded = ref(true);

const clearActivityMonth = ref('');
const clearingMonth = ref(false);

function hideBsModal(elementId: string) {
  const el = document.getElementById(elementId);
  if (el) Modal.getOrCreateInstance(el).hide();
}

function openClearMonthModal() {
  const d = new Date();
  clearActivityMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toggleExistingBudgets() {
  existingBudgetsExpanded.value = !existingBudgetsExpanded.value;
}

async function confirmClearMonthActivity() {
  if (!activeBudget.value) return;
  clearingMonth.value = true;
  try {
    const { deleted } = await window.fundlog.transaction.clearForBudgetMonth(
      activeBudget.value.id,
      clearActivityMonth.value,
    );
    await domain.loadTransactions();
    await loadCategories();
    toast.success(
      deleted
        ? `Removed ${deleted} transaction(s) for ${clearActivityMonth.value}.`
        : `No transactions found for ${clearActivityMonth.value}.`,
    );
    hideBsModal('clearMonthModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not clear activity for that month.');
  } finally {
    clearingMonth.value = false;
  }
}
const name = ref('');
const startMonth = ref('');
const monthlyIncome = ref<number | null>(null);
const ruleSet = ref<'fiftyThirtyTwenty' | 'custom'>('fiftyThirtyTwenty');

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpectedTxs = ref<Transaction[]>([]);
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
  if (!activeBudget.value || !domain.activeProfileId) return;
  const result = await window.fundlog.category.listByBudget(activeBudget.value.id);
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  const unexpected = await window.fundlog.transaction.listUnexpected(
    domain.activeProfileId,
    activeBudget.value.id,
  );
  unexpectedTxs.value = unexpected;
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

const plannedAmount = plannedAmountFromSub;

const percentOfBudget = (sub: BudgetSubcategory) => {
  if (!activeBudget.value || !activeBudget.value.monthlyIncome) return 0;
  const income = activeBudget.value.monthlyIncome;
  const amt = plannedAmount(sub);
  if (!amt) return 0;
  return Math.min(100, (amt / income) * 100);
};

const plannedBarResult = computed(() =>
  computePlannedExpenseBarSegments(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    unexpectedTxs.value,
    activeBudget.value?.monthlyIncome ?? 0,
  ),
);

const totalPlanned = computed(() => plannedBarResult.value.totalPlanned);

const totalUnexpected = computed(() => plannedBarResult.value.totalUnexpected);

const totalPercent = computed(() => {
  if (!activeBudget.value?.monthlyIncome) return 0;
  return plannedBarResult.value.combinedOfIncomePct;
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
  const result = await window.fundlog.subcategory.create({
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
  const result = await window.fundlog.category.updateColor({
    id: cat.id,
    color,
    budgetId: activeBudget.value.id,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
}
</script>

<template>
  <div class="view budgets-view container-fluid">
    <h2 class="mb-2">Budgets</h2>
    <p class="view-subtitle mb-4">
      Create separate budgets and choose the 50/30/20 rule or a custom structure.
    </p>

    <div class="budgets-toolbar d-flex flex-wrap align-items-center gap-2 mb-3">
      <button
        type="button"
        class="btn btn-primary"
        data-bs-toggle="modal"
        data-bs-target="#createBudgetModal"
      >
        New budget
      </button>
      <button
        v-if="activeBudget"
        type="button"
        class="btn btn-outline-warning"
        data-bs-toggle="modal"
        data-bs-target="#clearMonthModal"
        @click="openClearMonthModal"
      >
        Start clean month…
      </button>
    </div>

    <section class="card budgets-existing-card stacked-section mb-3">
      <button
        type="button"
        class="budgets-existing-toggle"
        :class="{ 'budgets-existing-toggle--expanded': existingBudgetsExpanded }"
        :aria-expanded="existingBudgetsExpanded"
        aria-controls="existingBudgetsPanel"
        id="existingBudgetsToggle"
        @click="toggleExistingBudgets"
      >
        <div class="budgets-existing-toggle-main">
          <span class="budgets-existing-toggle-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </span>
          <div class="budgets-existing-toggle-text">
            <span class="budgets-existing-toggle-title">Your budgets</span>
            <span class="budgets-existing-toggle-meta">
              {{ budgets.length === 0 ? 'None yet' : `${budgets.length} saved` }}
            </span>
          </div>
        </div>
        <span
          class="budgets-collapse-chevron"
          :class="{ 'budgets-collapse-chevron--collapsed': !existingBudgetsExpanded }"
          aria-hidden="true"
        />
      </button>

      <div
        v-show="existingBudgetsExpanded"
        id="existingBudgetsPanel"
        class="budgets-existing-panel"
        role="region"
        aria-labelledby="existingBudgetsToggle"
      >
        <div class="card-body budgets-existing-body">
          <div v-if="budgets.length === 0" class="budgets-existing-empty">
            <p class="budgets-existing-empty-title mb-1">No budgets yet</p>
            <p class="budgets-existing-empty-text mb-0">
              Use <strong>New budget</strong> above to create your first one.
            </p>
          </div>
          <ul v-else class="list-unstyled mb-0 budgets-existing-list">
            <li v-for="b in budgets" :key="b.id" class="budgets-existing-row">
              <div class="budgets-existing-row-inner">
                <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                  <span class="budgets-existing-name">{{ b.name }}</span>
                  <span v-if="b.isActive" class="badge bg-success">Active</span>
                </div>
                <div class="budgets-existing-details">
                  <span>From {{ b.startMonth }}</span>
                  <span class="budgets-existing-dot" aria-hidden="true">·</span>
                  <span>Income {{ b.monthlyIncome.toLocaleString() }}</span>
                  <template v-if="b.ruleSet === 'fiftyThirtyTwenty'">
                    <span class="budgets-existing-dot" aria-hidden="true">·</span>
                    <span>
                      50 / 30 / 20
                      ({{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 50) }} /
                      {{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 30) }} /
                      {{ formatFiftyThirtyTwentyAmount(b.monthlyIncome, 20) }})
                    </span>
                  </template>
                  <template v-else>
                    <span class="budgets-existing-dot" aria-hidden="true">·</span>
                    <span>Custom</span>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <div v-if="activeBudget" class="row g-3 mt-3">
      <div class="col-12">
        <section class="card">
          <div class="card-body">
            <h3 class="h5 card-title mb-2">
              Planned expenses for {{ activeBudget.name }}
            </h3>
            <p class="small text-muted mb-2">
              Configure fixed and variable expenses within each category. Unexpected expenses
              from the Expenses page are included by category.
            </p>
            <div class="mb-1 d-flex flex-wrap justify-content-between gap-2 small">
              <span>Planned line items</span>
              <span>
                {{ plannedBarResult.totalPlanned.toLocaleString() }}
                <span v-if="activeBudget.monthlyIncome" class="text-muted">
                  ({{
                    (
                      (plannedBarResult.totalPlanned / activeBudget.monthlyIncome) *
                      100
                    ).toFixed(1)
                  }}% of income)
                </span>
              </span>
            </div>
            <div class="mb-2 d-flex flex-wrap justify-content-between gap-2 small">
              <span>Unexpected (manual)</span>
              <span>
                {{ plannedBarResult.totalUnexpected.toLocaleString() }}
                <span v-if="activeBudget.monthlyIncome && plannedBarResult.totalUnexpected" class="text-muted">
                  ({{
                    (
                      (plannedBarResult.totalUnexpected / activeBudget.monthlyIncome) *
                      100
                    ).toFixed(1)
                  }}% of income)
                </span>
              </span>
            </div>
            <div class="mb-1 d-flex flex-wrap justify-content-between gap-2 small fw-semibold">
              <span>Combined</span>
              <span>
                {{ (plannedBarResult.totalPlanned + plannedBarResult.totalUnexpected).toLocaleString() }}
                ({{ totalPercent.toFixed(1) }}% of income)
              </span>
            </div>
            <PlannedExpenseCategoryBar
              :category-parts="plannedBarResult.categoryParts"
              :unallocated-bar-pct="plannedBarResult.unallocatedBarPct"
              empty-hint="Add planned amounts or record unexpected expenses to see spending by category on one bar."
            />
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
    id="clearMonthModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="clearMonthModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="clearMonthModalLabel" class="modal-title">Start a clean month</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body">
          <p class="mb-3">
            You are about to clear activity for
            <strong>{{ activeBudget?.name }}</strong>
            only. Other budgets are not affected.
          </p>
          <ul class="small mb-3 ps-3 clear-month-modal-list">
            <li>
              <strong>What stays:</strong> this budget’s categories, subcategories, planned amounts,
              and income figure. Your structure is unchanged.
            </li>
            <li>
              <strong>What is removed:</strong> every transaction stored against this budget whose
              date falls in the calendar month you pick below—imports, manual entries, and anything
              else tied to this budget in that month.
            </li>
            <li>
              <strong>Receipt files</strong> on disk are not deleted; only database links for those
              transactions are cleared.
            </li>
            <li>This action <strong>cannot be undone</strong>.</li>
          </ul>
          <p class="small text-muted mb-2">
            Use this when you want a fresh month of numbers without rebuilding the budget from
            scratch.
          </p>
          <label class="form-label">Calendar month to clear</label>
          <input v-model="clearActivityMonth" type="month" class="form-control" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-warning"
            :disabled="clearingMonth || !clearActivityMonth"
            @click="confirmClearMonthActivity"
          >
            {{ clearingMonth ? 'Working…' : 'Clear that month' }}
          </button>
        </div>
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

