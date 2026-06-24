<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import MoneyLeftSummary from '../components/MoneyLeftSummary.vue';
import CollapsibleSection from '../components/CollapsibleSection.vue';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import UnexpectedExpensesBarChart from '../components/UnexpectedExpensesBarChart.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import { computeBudgetHeadroom } from '../shared/budgetHeadroom';
import { calendarMonthNow } from '../shared/calendarMonth';
import { monthlyPortion } from '../shared/monthSpread';
import {
  computePlannedExpenseBarSegments,
  plannedAmountFromSub,
  transactionMonthlyImpact,
} from '../shared/plannedExpenseBar';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { FUND_COLORS } from '../shared/fundColors';
import type { BudgetCategory, BudgetSubcategory, Goal, Profile, Transaction } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const loading = ref(false);
const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpected = ref<Transaction[]>([]);
const purchases = ref<Transaction[]>([]);
const goalContributions = ref<Transaction[]>([]);
const amount = ref<number | null>(null);
const spreadMonths = ref(1);
const categoryId = ref<number | null>(null);
const label = ref('');
const purchaseAmount = ref<number | null>(null);
const purchaseSpreadMonths = ref(1);
const purchaseSubcategoryId = ref<number | null>(null);
const purchaseLabel = ref('');
const barMetric = ref<'amount' | 'count'>('amount');

const activeBudget = computed(() => domain.activeBudget);

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const groupedSubcategories = computed(() => {
  const grouped: Record<number, BudgetSubcategory[]> = {};
  for (const sub of subcategories.value) {
    const parentId = sub.parentCategoryId ?? 0;
    if (!grouped[parentId]) grouped[parentId] = [];
    grouped[parentId].push(sub);
  }
  return grouped;
});

const viewingMonth = calendarMonthNow();

const budgetIncome = computed(() => {
  const b = activeBudget.value;
  if (!b) return 0;
  return domain.effectiveMonthlyIncomeFor(b.id, viewingMonth);
});

const plannedBarResult = computed(() =>
  computePlannedExpenseBarSegments(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    unexpected.value,
    goalContributions.value,
    budgetIncome.value,
    viewingMonth,
  ),
);

const headroom = computed(() =>
  computeBudgetHeadroom(categories.value, plannedBarResult.value, budgetIncome.value),
);

const monthLabel = computed(() => {
  const [y, m] = viewingMonth.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

function formatMoney(amount: number) {
  return formatMoneyExact(amount, activeProfile.value?.currencyCode ?? 'USD');
}

function txMonthImpact(tx: Transaction) {
  return transactionMonthlyImpact(tx, viewingMonth);
}

function txCategoryColor(tx: Transaction, fallback: string) {
  return parentCategoryForSubcategory(tx.subcategoryId)?.color ?? fallback;
}

async function loadData() {
  if (!activeBudget.value || !domain.activeProfileId) return;
  loading.value = true;
  try {
    const catsResult = await window.fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = catsResult.categories;
    subcategories.value = catsResult.subcategories;
    const [tx, purchaseTx, goalTx] = await Promise.all([
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
    unexpected.value = tx;
    purchases.value = purchaseTx;
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

const spreadPreview = computed(() => {
  if (!amount.value || spreadMonths.value <= 1) return null;
  return monthlyPortion(amount.value, spreadMonths.value);
});

const totalUnexpected = computed(() =>
  unexpected.value.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, viewingMonth),
    0,
  ),
);

const totalPurchases = computed(() =>
  purchases.value.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, viewingMonth),
    0,
  ),
);

const purchaseSpreadPreview = computed(() => {
  if (!purchaseAmount.value || purchaseSpreadMonths.value <= 1) return null;
  return monthlyPortion(purchaseAmount.value, purchaseSpreadMonths.value);
});

const recentPurchases = computed(() => purchases.value.slice(0, 10));

const unexpectedThisMonth = computed(() =>
  unexpected.value.filter((tx) => transactionMonthlyImpact(tx, viewingMonth) > 0),
);

const mostCommonCategory = computed(() => {
  const counts: Record<number, number> = {};
  for (const tx of unexpectedThisMonth.value) {
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

/** Per parent category: unexpected spending with impact this calendar month. */
const unexpectedBarSegments = computed(() => {
  const totals: Record<number, { amount: number; count: number }> = {};
  let uncAmount = 0;
  let uncCount = 0;

  for (const tx of unexpectedThisMonth.value) {
    const impact = transactionMonthlyImpact(tx, viewingMonth);
    const cat = parentCategoryForSubcategory(tx.subcategoryId);
    if (!cat) {
      uncAmount += impact;
      if (impact > 0) uncCount += 1;
      continue;
    }
    const cur = totals[cat.id] ?? { amount: 0, count: 0 };
    cur.amount += impact;
    if (impact > 0) cur.count += 1;
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

const recentUnexpected = computed(() => unexpectedThisMonth.value.slice(0, 10));

const baseBudgetIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const monthIncomeBoost = computed(() =>
  Math.max(0, budgetIncome.value - baseBudgetIncome.value),
);

const purchasesPercent = computed(() => {
  if (!budgetIncome.value || !totalPurchases.value) return 0;
  return Math.min(100, (totalPurchases.value / budgetIncome.value) * 100);
});

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
  goalContributions.value.reduce(
    (sum, tx) => sum + transactionMonthlyImpact(tx, viewingMonth),
    0,
  ),
);

const goalSavingsPercent = computed(() => {
  if (!budgetIncome.value || !totalGoalSavingsRecorded.value) return 0;
  return Math.min(100, (totalGoalSavingsRecorded.value / budgetIncome.value) * 100);
});

const recentGoalContributions = computed(() => goalContributions.value.slice(0, 10));

const plannedAmount = (sub: BudgetSubcategory) => plannedAmountFromSub(sub, viewingMonth);

const totalPlanned = computed(() =>
  subcategories.value.reduce((sum, sub) => sum + plannedAmount(sub), 0),
);

const plannedPercent = computed(() => {
  if (!budgetIncome.value || !totalPlanned.value) return 0;
  return Math.min(100, (totalPlanned.value / budgetIncome.value) * 100);
});

const combinedTotal = computed(
  () =>
    totalPlanned.value +
    totalPurchases.value +
    totalUnexpected.value +
    totalGoalSavingsRecorded.value,
);

const combinedPercent = computed(() => {
  if (!budgetIncome.value || !combinedTotal.value) return 0;
  return Math.min(100, (combinedTotal.value / budgetIncome.value) * 100);
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
    await window.fundlog.transaction.createManual({
      profileId: domain.activeProfileId,
      budgetId: activeBudget.value.id,
      subcategoryId,
      date,
      amount: amount.value,
      description: label.value.trim(),
      spreadMonths: Math.max(1, Math.floor(spreadMonths.value || 1)),
      entryKind: 'unexpected',
    });
    amount.value = null;
    spreadMonths.value = 1;
    categoryId.value = null;
    label.value = '';
    await loadData();
    hideBsModal('addUnexpectedModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not add expense.');
  }
}

async function addPurchase() {
  if (
    !activeBudget.value ||
    !domain.activeProfileId ||
    !purchaseAmount.value ||
    !purchaseSubcategoryId.value
  )
    return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const sub = subcategoryById.value[purchaseSubcategoryId.value];
  try {
    await window.fundlog.transaction.createManual({
      profileId: domain.activeProfileId,
      budgetId: activeBudget.value.id,
      subcategoryId: purchaseSubcategoryId.value,
      date,
      amount: purchaseAmount.value,
      description: purchaseLabel.value.trim() || sub?.label || 'Purchase',
      spreadMonths: Math.max(1, Math.floor(purchaseSpreadMonths.value || 1)),
      entryKind: 'purchase',
    });
    purchaseAmount.value = null;
    purchaseSpreadMonths.value = 1;
    purchaseSubcategoryId.value = null;
    purchaseLabel.value = '';
    await loadData();
    hideBsModal('addPurchaseModal');
    toast.success('Purchase logged.');
  } catch (e) {
    console.error(e);
    toast.error('Could not log purchase.');
  }
}
</script>

<template>
  <div class="view view-expenses container-fluid">
    <p class="view-page-eyebrow mb-1">Spending</p>
    <h2 class="mb-2">Expenses</h2>
    <p class="view-subtitle expenses-page-intro mb-4">
      Log <strong>purchases</strong> against budget line items and track
      <strong>unexpected</strong> spending on its own. Summary percentages use your active
      budget’s effective income for <strong>{{ monthLabel }}</strong> — see
      <RouterLink to="/extra-income">Extra income</RouterLink> for one-off bumps.
    </p>

    <p v-if="!activeBudget" class="status-text">
      Create and select a budget first to record expenses.
    </p>

    <LoadingView v-else-if="loading" message="Loading expenses…" />

    <div v-else class="expenses-page-body">
      <div class="expenses-quick-actions mb-3">
        <button
          type="button"
          class="expenses-quick-action expenses-quick-action--purchase"
          data-bs-toggle="modal"
          data-bs-target="#addPurchaseModal"
        >
          <span class="expenses-quick-action__glyph" aria-hidden="true">+</span>
          <span class="expenses-quick-action__copy">
            <span class="expenses-quick-action__label">Log purchase</span>
            <span class="expenses-quick-action__hint">Against a budget line item</span>
          </span>
        </button>
        <button
          type="button"
          class="expenses-quick-action expenses-quick-action--unexpected"
          data-bs-toggle="modal"
          data-bs-target="#addUnexpectedModal"
        >
          <span class="expenses-quick-action__glyph" aria-hidden="true">!</span>
          <span class="expenses-quick-action__copy">
            <span class="expenses-quick-action__label">Add unexpected</span>
            <span class="expenses-quick-action__hint">Off-plan spending this month</span>
          </span>
        </button>
        <RouterLink to="/goals" class="expenses-quick-action expenses-quick-action--goals">
          <span class="expenses-quick-action__glyph" aria-hidden="true">◎</span>
          <span class="expenses-quick-action__copy">
            <span class="expenses-quick-action__label">Record goal savings</span>
            <span class="expenses-quick-action__hint">On the Goals page</span>
          </span>
        </RouterLink>
      </div>

      <div class="row g-3">
        <div class="col-12">
          <CollapsibleSection
            title="What's left"
            :meta="headroom.spendingTiers.memorableLine ?? monthLabel"
            storage-key="expenses-money-left"
            integrated
          >
            <MoneyLeftSummary
              embedded
              variant="snapshot"
              :headroom="headroom"
              :currency-code="activeProfile?.currencyCode ?? 'USD'"
              :month-label="monthLabel"
            />
          </CollapsibleSection>
        </div>

        <div class="col-12">
          <section class="expenses-snapshot expenses-panel">
            <header class="expenses-snapshot__header">
              <div>
                <h3 class="expenses-snapshot__title mb-0">This month</h3>
                <p class="expenses-snapshot__meta mb-0">
                  {{ formatMoney(budgetIncome) }} effective income
                  <span v-if="monthIncomeBoost > 0">
                    · +{{ formatMoney(monthIncomeBoost) }} extra
                  </span>
                </p>
              </div>
              <div class="expenses-snapshot__badge">
                {{ formatPercent(combinedPercent) }}% accounted
              </div>
            </header>

            <div class="budget-stat-grid expenses-snapshot__stats">
              <div class="budget-stat">
                <div class="budget-stat__label">Planned</div>
                <div class="budget-stat__value">{{ formatMoney(totalPlanned) }}</div>
                <div class="budget-stat__pct">{{ formatPercent(plannedPercent) }}% of income</div>
              </div>
              <div class="budget-stat budget-stat--purchase">
                <div class="budget-stat__label">Purchases</div>
                <div class="budget-stat__value">{{ formatMoney(totalPurchases) }}</div>
                <div class="budget-stat__pct">{{ formatPercent(purchasesPercent) }}% of income</div>
              </div>
              <div class="budget-stat budget-stat--unexpected">
                <div class="budget-stat__label">Unexpected</div>
                <div class="budget-stat__value">{{ formatMoney(totalUnexpected) }}</div>
                <div class="budget-stat__pct">{{ formatPercent(unexpectedPercent) }}% of income</div>
              </div>
              <div class="budget-stat budget-stat--goal">
                <div class="budget-stat__label">Goal savings</div>
                <div class="budget-stat__value">{{ formatMoney(totalGoalSavingsRecorded) }}</div>
                <div class="budget-stat__pct">{{ formatPercent(goalSavingsPercent) }}% of income</div>
              </div>
            </div>

            <div class="expenses-snapshot__mix">
              <p class="expenses-snapshot__mix-label">Where it goes</p>
              <PlannedExpenseCategoryBar
                :category-parts="plannedBarResult.categoryParts"
                :unallocated-bar-pct="plannedBarResult.unallocatedBarPct"
                empty-hint="Add line items on Budgets to see the mix."
                aria-label="Monthly spending mix by category"
              />
              <p class="expenses-snapshot__foot small text-muted mb-0">
                {{ formatMoney(combinedTotal) }} total this month across planned, purchases,
                unexpected, and goal savings.
              </p>
            </div>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <CollapsibleSection
            class="expenses-panel expenses-panel--purchase"
            title="Purchases"
            :meta="
              purchases.length
                ? `${purchases.length} logged · ${formatMoney(totalPurchases)} this month`
                : 'None yet'
            "
            storage-key="expenses-purchases"
          >
            <p class="expenses-panel__intro small text-muted mb-3">
              Planned spending logged against a line item from
              <RouterLink to="/budgets">Budgets</RouterLink>.
            </p>
            <ul v-if="recentPurchases.length" class="expense-activity-list list-unstyled mb-0">
              <li
                v-for="tx in recentPurchases"
                :key="tx.id"
                class="expense-activity-item"
              >
                <span
                  class="expense-activity-item__swatch"
                  :style="{ background: txCategoryColor(tx, FUND_COLORS.purchase) }"
                />
                <div class="expense-activity-item__main">
                  <span class="expense-activity-item__title">
                    {{ tx.description || 'Purchase' }}
                  </span>
                  <span class="expense-activity-item__meta">
                    {{ tx.date }}
                    <span v-if="tx.subcategoryId != null && subcategoryById[tx.subcategoryId]">
                      · {{ subcategoryById[tx.subcategoryId].label }}
                    </span>
                  </span>
                </div>
                <div class="expense-activity-item__amounts">
                  <span class="expense-activity-item__total">{{ formatMoney(tx.amount) }}</span>
                  <span
                    v-if="Math.abs(txMonthImpact(tx) - tx.amount) > 0.009"
                    class="expense-activity-item__impact"
                  >
                    {{ formatMoney(txMonthImpact(tx)) }}/mo
                  </span>
                </div>
              </li>
            </ul>
            <p v-else class="expenses-panel__empty small mb-0">
              No purchases logged yet. Use <strong>Log purchase</strong> above.
            </p>
          </CollapsibleSection>
        </div>

        <div class="col-12 col-lg-6">
          <CollapsibleSection
            class="expenses-panel expenses-panel--unexpected"
            title="Unexpected expenses"
            :meta="
              unexpectedThisMonth.length
                ? `${unexpectedThisMonth.length} this month · ${formatMoney(totalUnexpected)}`
                : 'None this month'
            "
            storage-key="expenses-unexpected"
          >
            <p
              v-if="mostCommonCategory && unexpectedThisMonth.length"
              class="expenses-panel__highlight small mb-3"
            >
              Most frequent category:
              <strong>{{ mostCommonCategory.label }}</strong>
            </p>
            <p v-else-if="!unexpectedThisMonth.length" class="expenses-panel__empty small text-muted mb-3">
              No unexpected expenses this month.
            </p>

            <div v-if="unexpectedThisMonth.length" class="expenses-chart-panel mb-3">
              <div class="expenses-chart-panel__head">
                <h4 class="expenses-chart-panel__title">By category</h4>
                <div class="btn-group btn-group-sm" role="group" aria-label="Bar chart metric">
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :class="{ active: barMetric === 'amount' }"
                    @click="barMetric = 'amount'"
                  >
                    Amount
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :class="{ active: barMetric === 'count' }"
                    @click="barMetric = 'count'"
                  >
                    Count
                  </button>
                </div>
              </div>
              <UnexpectedExpensesBarChart :segments="unexpectedBarSegments" :metric="barMetric" />
            </div>

            <h4 v-if="recentUnexpected.length" class="expenses-activity-heading h6 mb-2">
              Recent
            </h4>
            <ul v-if="recentUnexpected.length" class="expense-activity-list list-unstyled mb-0">
              <li
                v-for="tx in recentUnexpected"
                :key="tx.id"
                class="expense-activity-item"
              >
                <span
                  class="expense-activity-item__swatch"
                  :style="{ background: txCategoryColor(tx, FUND_COLORS.unexpected) }"
                />
                <div class="expense-activity-item__main">
                  <span class="expense-activity-item__title">
                    {{ tx.description || 'Unexpected expense' }}
                  </span>
                  <span class="expense-activity-item__meta">{{ tx.date }}</span>
                </div>
                <div class="expense-activity-item__amounts">
                  <span class="expense-activity-item__total">{{ formatMoney(tx.amount) }}</span>
                  <span
                    v-if="Math.abs(txMonthImpact(tx) - tx.amount) > 0.009"
                    class="expense-activity-item__impact"
                  >
                    {{ formatMoney(txMonthImpact(tx)) }}/mo
                  </span>
                </div>
              </li>
            </ul>
          </CollapsibleSection>
        </div>

        <div class="col-12">
          <CollapsibleSection
            class="expenses-panel expenses-panel--goals"
            title="Goal savings"
            :meta="
              goalContributions.length
                ? `${goalContributions.length} logged · ${formatMoney(totalGoalSavingsRecorded)} this month`
                : 'None yet'
            "
            :default-expanded="false"
            storage-key="expenses-goal-savings"
          >
            <p class="expenses-panel__intro small text-muted mb-3">
              Amounts from <strong>Record savings</strong> on the Goals page.
            </p>
            <ul
              v-if="recentGoalContributions.length"
              class="expense-activity-list list-unstyled mb-0"
            >
              <li
                v-for="tx in recentGoalContributions"
                :key="tx.id"
                class="expense-activity-item"
              >
                <span
                  class="expense-activity-item__swatch"
                  :style="{ background: FUND_COLORS.goalSavings }"
                />
                <div class="expense-activity-item__main">
                  <span class="expense-activity-item__title">
                    {{ tx.description || 'Goal savings' }}
                  </span>
                  <span class="expense-activity-item__meta">
                    {{ tx.date }}
                    <span v-if="tx.goalId != null && goalById.get(tx.goalId)">
                      · {{ goalById.get(tx.goalId)!.name }}
                    </span>
                  </span>
                </div>
                <div class="expense-activity-item__amounts">
                  <span class="expense-activity-item__total">{{ formatMoney(tx.amount) }}</span>
                  <span
                    v-if="Math.abs(txMonthImpact(tx) - tx.amount) > 0.009"
                    class="expense-activity-item__impact"
                  >
                    {{ formatMoney(txMonthImpact(tx)) }}/mo
                  </span>
                </div>
              </li>
            </ul>
            <p v-else class="expenses-panel__empty small mb-0">
              No goal savings recorded on this budget yet.
            </p>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="addPurchaseModal"
    tabindex="-1"
    aria-labelledby="addPurchaseModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addPurchaseModalLabel" class="modal-title">Log purchase</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <form @submit.prevent="addPurchase">
          <div class="modal-body row g-3">
            <div class="col-12">
              <label class="form-label">
                Line item
                <select v-model="purchaseSubcategoryId" class="form-select" required>
                  <option :value="null" disabled>Select a line item</option>
                  <template v-for="cat in categories" :key="cat.id">
                    <option
                      v-for="sub in groupedSubcategories[cat.id] || []"
                      :key="sub.id"
                      :value="sub.id"
                    >
                      {{ cat.label }} · {{ sub.label }}
                    </option>
                  </template>
                </select>
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Amount
                <input
                  v-model.number="purchaseAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  required
                />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Spread over (months)
                <input
                  v-model.number="purchaseSpreadMonths"
                  type="number"
                  min="1"
                  max="60"
                  class="form-control"
                />
              </label>
            </div>
            <div v-if="purchaseSpreadPreview != null" class="col-12">
              <p class="small expense-monthly-impact mb-0">
                This month’s impact:
                <strong>{{ formatMoney(purchaseSpreadPreview) }}/mo</strong>
              </p>
            </div>
            <div class="col-12">
              <label class="form-label">
                Note
                <input
                  v-model="purchaseLabel"
                  type="text"
                  class="form-control"
                  placeholder="What you bought"
                />
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save purchase</button>
          </div>
        </form>
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
            <div class="col-6">
              <label class="form-label">
                Spread over (months)
                <input
                  v-model.number="spreadMonths"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  class="form-control"
                  placeholder="1"
                />
              </label>
            </div>
            <div v-if="spreadPreview != null" class="col-12">
              <p class="small expense-monthly-impact mb-0">
                This month’s impact:
                <strong>{{ formatMoney(spreadPreview) }}/mo</strong>
                from {{ formatMoney(amount ?? 0) }} total
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
              Add unexpected expense
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

