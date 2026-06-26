<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useDomainStore } from '../stores/domain';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import CollapsibleSection from '../components/CollapsibleSection.vue';
import BudgetPieCompare from '../components/BudgetPieCompare.vue';
import MoneyLeftSummary from '../components/MoneyLeftSummary.vue';
import VendorPicker from '../components/VendorPicker.vue';
import CategoryImpactList from '../components/CategoryImpactList.vue';
import {
  computePlannedExpenseBarSegments,
  buildPieSegments,
  plannedAmountFromSub,
  plannedTotalFromSub,
} from '../shared/plannedExpenseBar';
import { computeCategoryImpact } from '../shared/categoryImpact';
import { computeBudgetHeadroom } from '../shared/budgetHeadroom';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { calendarMonthNow } from '../shared/calendarMonth';
import { monthlyPortion, spreadMonthsLabel } from '../shared/monthSpread';
import type { BudgetCategory, BudgetSubcategory, Profile, Transaction } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const viewingMonth = calendarMonthNow();

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpectedTxs = ref<Transaction[]>([]);
const purchaseTxs = ref<Transaction[]>([]);
const goalContributionTxs = ref<Transaction[]>([]);

/** Distinct vendor names ever used on this budget, for the purchase vendor picker. */
const knownVendors = computed(() => {
  const set = new Set<string>();
  for (const tx of [...purchaseTxs.value, ...unexpectedTxs.value]) {
    const raw = tx.merchant?.trim();
    if (raw) set.add(raw);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});
const editingCategoryId = ref<number | null>(null);
const categoryPanelExpanded = ref<Record<number, boolean>>({});
const editingSubId = ref<number | null>(null);
const loggingPurchaseSubId = ref<number | null>(null);
const purchaseAmount = ref<number | null>(null);
const purchaseLabel = ref('');
const purchaseMerchant = ref('');
const purchaseSpreadMonths = ref(1);
const newLabel = ref('');
const newType = ref<'fixed' | 'variable'>('fixed');
const newTargetPercent = ref<number | null>(null);
const newTargetAmount = ref<number | null>(null);
const newMinAmount = ref<number | null>(null);
const newMaxAmount = ref<number | null>(null);
const newSpreadMonths = ref(1);
const newSpreadStartMonth = ref(viewingMonth);

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

function currencyCode() {
  return activeProfile.value?.currencyCode?.trim() || 'USD';
}

function formatMoney(amount: number) {
  return formatMoneyExact(amount, currencyCode());
}

const monthLabel = computed(() => {
  const [y, m] = viewingMonth.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await loadCategories();
});

const activeBudget = computed(() => domain.activeBudget);

const planningMonthIncome = computed(() => {
  const b = activeBudget.value;
  if (!b) return 0;
  return domain.effectiveMonthlyIncomeFor(b.id, calendarMonthNow());
});

const monthIncomeBoost = computed(() => {
  const b = activeBudget.value;
  if (!b) return 0;
  return domain.incomeBoostSumForBudgetMonth(b.id, calendarMonthNow());
});

async function loadCategories() {
  if (!activeBudget.value || !domain.activeProfileId) return;
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
  loadCategoryPanelStates();
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

const percentOfBudget = (sub: BudgetSubcategory) => {
  if (!activeBudget.value || !planningMonthIncome.value) return 0;
  const income = planningMonthIncome.value;
  const amt = plannedAmountFromSub(sub, viewingMonth);
  if (!amt) return 0;
  return Math.min(100, (amt / income) * 100);
};

function categoryBucketFor(cat: BudgetCategory) {
  return headroom.value.buckets.find((b) => b.ruleKey === cat.ruleKey);
}

function categoryPanelStorageKey(catId: number) {
  return `fundlog-collapse:budgets-cat-${catId}`;
}

function isCategoryPanelExpanded(catId: number) {
  return categoryPanelExpanded.value[catId] === true;
}

function loadCategoryPanelStates() {
  const next: Record<number, boolean> = { ...categoryPanelExpanded.value };
  for (const cat of categories.value) {
    try {
      const stored = localStorage.getItem(categoryPanelStorageKey(cat.id));
      if (stored === '0') next[cat.id] = false;
      else if (stored === '1') next[cat.id] = true;
    } catch {
      /* ignore */
    }
  }
  categoryPanelExpanded.value = next;
}

function toggleCategoryPanel(catId: number) {
  const next = !isCategoryPanelExpanded(catId);
  categoryPanelExpanded.value = { ...categoryPanelExpanded.value, [catId]: next };
  try {
    localStorage.setItem(categoryPanelStorageKey(catId), next ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ensureCategoryPanelExpanded(catId: number) {
  if (isCategoryPanelExpanded(catId)) return;
  categoryPanelExpanded.value = { ...categoryPanelExpanded.value, [catId]: true };
  try {
    localStorage.setItem(categoryPanelStorageKey(catId), '1');
  } catch {
    /* ignore */
  }
}

function categoryLineCount(catId: number) {
  return (groupedSubcategories.value[catId] || []).length;
}

function categoryUsedPct(cat: BudgetCategory) {
  const bucket = categoryBucketFor(cat);
  if (!bucket || bucket.targetAmount <= 0) return 0;
  return Math.min(100, (bucket.committed / bucket.targetAmount) * 100);
}

const plannedBarResult = computed(() =>
  computePlannedExpenseBarSegments(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    unexpectedTxs.value,
    purchaseTxs.value,
    goalContributionTxs.value,
    planningMonthIncome.value,
    viewingMonth,
  ),
);

const headroom = computed(() =>
  computeBudgetHeadroom(categories.value, plannedBarResult.value, planningMonthIncome.value),
);

const categoryImpact = computed(() =>
  computeCategoryImpact(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    purchaseTxs.value,
    unexpectedTxs.value,
    viewingMonth,
  ),
);

const anyCategoryImpact = computed(() =>
  categoryImpact.value.some((row) => row.extra > 0),
);

const totalExtraSpend = computed(() =>
  categoryImpact.value.reduce((sum, row) => sum + row.extra, 0),
);

/** Uncommitted leftover before purchases/unexpected: income − planned − goal savings. */
const uncommittedPool = computed(
  () =>
    planningMonthIncome.value -
    plannedBarResult.value.totalPlanned -
    plannedBarResult.value.totalGoalSavings,
);

const pieSegments = computed(() =>
  buildPieSegments(plannedBarResult.value, planningMonthIncome.value),
);

const allocationTargetCaption = computed(() => {
  const b = activeBudget.value;
  if (!b) return '';
  if (b.ruleSet === 'fiftyThirtyTwenty') return '50 / 30 / 20 rule targets';
  return 'Custom category targets';
});

const totalPlanned = computed(() => plannedBarResult.value.totalPlanned);

const totalUnexpected = computed(() => plannedBarResult.value.totalUnexpected);

const totalPercent = computed(() => {
  if (!planningMonthIncome.value) return 0;
  return plannedBarResult.value.combinedOfIncomePct;
});

function resetSubForm() {
  newLabel.value = '';
  newType.value = 'fixed';
  newTargetPercent.value = null;
  newTargetAmount.value = null;
  newMinAmount.value = null;
  newMaxAmount.value = null;
  newSpreadMonths.value = 1;
  newSpreadStartMonth.value = viewingMonth;
}

function cancelSubForm() {
  editingCategoryId.value = null;
  editingSubId.value = null;
  loggingPurchaseSubId.value = null;
  purchaseAmount.value = null;
  purchaseLabel.value = '';
  purchaseMerchant.value = '';
  purchaseSpreadMonths.value = 1;
  resetSubForm();
}

function startLogPurchase(sub: BudgetSubcategory) {
  if (sub.parentCategoryId != null) ensureCategoryPanelExpanded(sub.parentCategoryId);
  cancelSubForm();
  loggingPurchaseSubId.value = sub.id;
  purchaseLabel.value = sub.label;
}

async function submitPurchase(sub: BudgetSubcategory) {
  if (!activeBudget.value || !domain.activeProfileId || !purchaseAmount.value) return;
  const now = new Date();
  try {
    await window.fundlog.transaction.createManual({
      profileId: domain.activeProfileId,
      budgetId: activeBudget.value.id,
      subcategoryId: sub.id,
      date: now.toISOString().slice(0, 10),
      amount: purchaseAmount.value,
      description: purchaseLabel.value.trim() || sub.label,
      merchant: purchaseMerchant.value.trim() || null,
      spreadMonths: Math.max(1, Math.floor(purchaseSpreadMonths.value || 1)),
      entryKind: 'purchase',
    });
    cancelSubForm();
    await loadCategories();
    toast.success('Purchase logged.');
  } catch (e) {
    console.error(e);
    toast.error('Could not log purchase.');
  }
}

function startAddFor(categoryId: number) {
  ensureCategoryPanelExpanded(categoryId);
  cancelSubForm();
  editingCategoryId.value = categoryId;
}

function startEditSub(sub: BudgetSubcategory) {
  if (sub.parentCategoryId != null) ensureCategoryPanelExpanded(sub.parentCategoryId);
  loggingPurchaseSubId.value = null;
  editingCategoryId.value = null;
  editingSubId.value = sub.id;
  newLabel.value = sub.label;
  newType.value = sub.isFlexible ? 'variable' : 'fixed';
  newTargetPercent.value = sub.targetPercent;
  newTargetAmount.value = sub.targetAmount;
  newMinAmount.value = sub.minAmount ?? null;
  newMaxAmount.value = sub.maxAmount ?? null;
  newSpreadMonths.value = Math.max(1, sub.spreadMonths ?? 1);
  newSpreadStartMonth.value = sub.spreadStartMonth ?? viewingMonth;
}

async function submitEditSubcategory(category: BudgetCategory) {
  if (!activeBudget.value || !editingSubId.value || !newLabel.value.trim()) return;
  const spreadMonths = Math.max(1, Math.floor(newSpreadMonths.value || 1));
  const result = await window.fundlog.subcategory.update({
    id: editingSubId.value,
    budgetId: activeBudget.value.id,
    label: newLabel.value.trim(),
    targetPercent: newTargetPercent.value,
    targetAmount: newType.value === 'fixed' ? newTargetAmount.value : null,
    minAmount: newType.value === 'variable' ? newMinAmount.value : null,
    maxAmount: newType.value === 'variable' ? newMaxAmount.value : null,
    isFlexible: newType.value === 'variable',
    spreadMonths,
    spreadStartMonth: spreadMonths > 1 ? newSpreadStartMonth.value : null,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  cancelSubForm();
}

async function deleteSubcategoryItem(sub: BudgetSubcategory) {
  if (!activeBudget.value) return;
  if (!window.confirm(`Remove "${sub.label}" from this budget?`)) return;
  const result = await window.fundlog.subcategory.delete({
    id: sub.id,
    budgetId: activeBudget.value.id,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  if (editingSubId.value === sub.id) cancelSubForm();
}

function subSpreadHint(sub: BudgetSubcategory): string | null {
  const spread = Math.max(1, sub.spreadMonths ?? 1);
  if (spread <= 1) return null;
  const total = plannedTotalFromSub(sub);
  const monthly = plannedAmountFromSub(sub, viewingMonth);
  if (monthly <= 0) {
    return `${formatMoney(total)} over ${spreadMonthsLabel(spread)} (not active this month)`;
  }
  return `${formatMoney(total)} over ${spreadMonthsLabel(spread)} → ${formatMoney(monthly)}/mo`;
}

function lineItemPlannedPrimary(sub: BudgetSubcategory): string {
  if (sub.isFlexible) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }
  return formatMoney(plannedAmountFromSub(sub, viewingMonth));
}

function lineItemPlannedSuffix(sub: BudgetSubcategory): string {
  return sub.isFlexible ? '/mo range' : '/mo';
}

function lineItemPlannedNote(sub: BudgetSubcategory): string | null {
  if (sub.isFlexible) return null;
  return subSpreadHint(sub);
}

function previewMonthlyFromForm(): number | null {
  if (newType.value === 'fixed' && newTargetAmount.value != null && newTargetAmount.value > 0) {
    return monthlyPortion(newTargetAmount.value, newSpreadMonths.value);
  }
  return null;
}

async function submitSubcategory(category: BudgetCategory) {
  if (!activeBudget.value || !newLabel.value.trim()) return;
  const spreadMonths = Math.max(1, Math.floor(newSpreadMonths.value || 1));
  const result = await window.fundlog.subcategory.create({
    budgetId: activeBudget.value.id,
    parentCategoryId: category.id,
    label: newLabel.value.trim(),
    targetPercent: newTargetPercent.value,
    targetAmount: newType.value === 'fixed' ? newTargetAmount.value : null,
    minAmount: newType.value === 'variable' ? newMinAmount.value : null,
    maxAmount: newType.value === 'variable' ? newMaxAmount.value : null,
    isFlexible: newType.value === 'variable',
    spreadMonths,
    spreadStartMonth: spreadMonths > 1 ? newSpreadStartMonth.value : null,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  cancelSubForm();
}
</script>

<template>
  <div class="view view-budgets budgets-view container-fluid">
    <header class="budgets-page-header">
      <p class="view-page-eyebrow">Planning</p>
      <h2>Budgets</h2>
      <p class="view-subtitle budgets-page-header__lede">
        Build your plan, spread costs over months, and tune line items by category.
      </p>
      <p v-if="!activeBudget" class="status-text budgets-page-header__status">
        Create a budget on
        <RouterLink to="/budget-records">Budget Records</RouterLink>
        to start planning.
      </p>
      <p v-else class="budgets-page-header__meta">
        Planning <strong>{{ activeBudget.name }}</strong>
        <span class="budgets-existing-dot" aria-hidden="true">·</span>
        <RouterLink to="/budget-records">Manage budgets</RouterLink>
      </p>
    </header>

    <div v-if="activeBudget" class="row g-3">
      <div class="col-12">
        <CollapsibleSection
          title="What's left"
          :meta="headroom.spendingTiers.memorableLine ?? monthLabel"
          storage-key="budgets-money-left"
          integrated
        >
          <MoneyLeftSummary
            embedded
            variant="planning"
            :headroom="headroom"
            :currency-code="currencyCode()"
            :month-label="monthLabel"
          />
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel"
          title="Income allocation"
          :meta="`Compare plan vs target · ${monthLabel}`"
          :default-expanded="false"
          storage-key="budgets-allocation-compare"
        >
          <BudgetPieCompare
            v-if="categories.length"
            :categories="categories"
            :actual-segments="pieSegments"
            :income="planningMonthIncome"
            :currency-code="currencyCode()"
            actual-caption="Planned, unexpected, and goal savings"
            :target-caption="allocationTargetCaption"
          />
          <p v-else class="small mb-0">
            Add expenses to see your spending mix.
          </p>
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel"
          :title="`${activeBudget.name} · ${monthLabel}`"
          :meta="`Effective income ${formatMoney(planningMonthIncome)}`"
          storage-key="budgets-month-overview"
        >
          <div class="d-flex flex-wrap justify-content-end mb-3">
            <RouterLink to="/extra-income" class="btn btn-sm btn-outline-secondary">
              Extra income
            </RouterLink>
          </div>

          <div class="budget-stat-grid mb-3">
              <div class="budget-stat">
                <div class="budget-stat__label">Planned</div>
                <div class="budget-stat__value">
                  {{ formatMoney(plannedBarResult.totalPlanned) }}
                </div>
                <div v-if="planningMonthIncome" class="budget-stat__pct">
                  {{
                    formatPercent((plannedBarResult.totalPlanned / planningMonthIncome) * 100)
                  }}% of income
                </div>
              </div>
              <div class="budget-stat">
                <div class="budget-stat__label">Purchases</div>
                <div class="budget-stat__value">
                  {{ formatMoney(plannedBarResult.totalPurchases) }}
                </div>
                <div v-if="planningMonthIncome && plannedBarResult.totalPurchases" class="budget-stat__pct">
                  {{
                    formatPercent((plannedBarResult.totalPurchases / planningMonthIncome) * 100)
                  }}% of income
                </div>
              </div>
              <div class="budget-stat">
                <div class="budget-stat__label">Unexpected</div>
                <div class="budget-stat__value">
                  {{ formatMoney(plannedBarResult.totalUnexpected) }}
                </div>
                <div v-if="planningMonthIncome && plannedBarResult.totalUnexpected" class="budget-stat__pct">
                  {{
                    formatPercent((plannedBarResult.totalUnexpected / planningMonthIncome) * 100)
                  }}% of income
                </div>
              </div>
              <div class="budget-stat">
                <div class="budget-stat__label">Goal savings</div>
                <div class="budget-stat__value">
                  {{ formatMoney(plannedBarResult.totalGoalSavings) }}
                </div>
                <div v-if="planningMonthIncome && plannedBarResult.totalGoalSavings" class="budget-stat__pct">
                  {{
                    formatPercent((plannedBarResult.totalGoalSavings / planningMonthIncome) * 100)
                  }}% of income
                </div>
              </div>
              <div class="budget-stat">
                <div class="budget-stat__label">Combined</div>
                <div class="budget-stat__value">
                  {{ formatMoney(headroom.committedTotal) }}
                </div>
                <div class="budget-stat__pct">{{ formatPercent(totalPercent) }}% of income</div>
              </div>
            </div>

            <PlannedExpenseCategoryBar
              :category-parts="plannedBarResult.categoryParts"
              :unallocated-bar-pct="plannedBarResult.unallocatedBarPct"
              empty-hint="Add planned amounts, unexpected expenses, or goal savings to see spending by category."
            />
            <p class="small mt-3 mb-0">
              Purchases and unexpected expenses from
              <RouterLink to="/expenses">Expenses</RouterLink>
              and goal savings from
              <RouterLink to="/goals">Goals</RouterLink>
              count toward this month when spread across months.
            </p>
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel expenses-panel--impact"
          title="Where the plan adjusts"
          :meta="
            anyCategoryImpact
              ? `${formatMoney(totalExtraSpend)} extra · ${monthLabel}`
              : 'No extra spend this month'
          "
          :default-expanded="false"
          storage-key="budgets-category-impact"
        >
          <p class="small text-muted mb-3">
            Purchases and unexpected expenses are paid out of your uncommitted leftover (income
            after planned amounts and goal savings). This shows which categories are eating it and
            how much is still left.
          </p>
          <CategoryImpactList
            :rows="categoryImpact"
            :currency-code="currencyCode()"
            :pool="uncommittedPool"
            empty-hint="Log a purchase or unexpected expense to see where your leftover goes."
          />
        </CollapsibleSection>
      </div>

      <div class="col-12">
        <CollapsibleSection
          title="Line items by category"
          meta="Budget, committed, and left per category"
          :default-expanded="false"
          storage-key="budgets-line-items"
        >
          <p class="line-items-intro mb-2">
            Each bucket shows budget health at a glance — expand a card to log purchases or edit
            expenses. Unexpected spending goes on
            <RouterLink to="/expenses">Expenses</RouterLink>.
          </p>
          <div class="budget-categories">
              <section
                v-for="cat in categories"
                :key="cat.id"
                class="budget-category-panel"
                :class="{
                  'budget-category-panel--over': (categoryBucketFor(cat)?.remaining ?? 0) < 0,
                  'budget-category-panel--collapsed': !isCategoryPanelExpanded(cat.id),
                }"
                :style="{ '--category-accent': cat.color }"
              >
                <header class="budget-category-panel__header">
                  <button
                    type="button"
                    class="budget-category-panel__toggle"
                    :aria-expanded="isCategoryPanelExpanded(cat.id)"
                    :aria-controls="`budget-category-panel-${cat.id}`"
                    @click="toggleCategoryPanel(cat.id)"
                  >
                    <div class="budget-category-panel__identity">
                      <span class="budget-category-panel__swatch" aria-hidden="true" />
                      <div class="budget-category-panel__titles">
                        <h3 class="budget-category-panel__title">{{ cat.label }}</h3>
                        <p class="budget-category-panel__target">
                          {{ cat.targetPercent }}% income ·
                          {{ categoryLineCount(cat.id) }}
                          {{ categoryLineCount(cat.id) === 1 ? 'expense' : 'expenses' }}
                        </p>
                      </div>
                    </div>
                    <div
                      class="budget-category-panel__hero"
                      :class="{
                        'budget-category-panel__hero--over':
                          (categoryBucketFor(cat)?.remaining ?? 0) < 0,
                      }"
                    >
                      <span class="budget-category-panel__hero-value">
                        {{ formatMoney(categoryBucketFor(cat)?.remaining ?? 0) }}
                      </span>
                      <span class="budget-category-panel__hero-label">left</span>
                    </div>
                    <span
                      class="budgets-collapse-chevron budget-category-panel__chevron"
                      :class="{
                        'budgets-collapse-chevron--collapsed': !isCategoryPanelExpanded(cat.id),
                      }"
                      aria-hidden="true"
                    />
                  </button>

                  <div class="budget-category-panel__meter-wrap">
                    <div
                      class="budget-category-panel__meter"
                      role="progressbar"
                      :aria-valuenow="categoryUsedPct(cat)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      :aria-label="`${cat.label} budget used`"
                    >
                      <div
                        class="budget-category-panel__meter-fill"
                        :style="{
                          width: categoryUsedPct(cat) + '%',
                          backgroundColor: cat.color,
                        }"
                      />
                    </div>
                    <span class="budget-category-panel__meter-label">
                      {{ formatPercent(categoryUsedPct(cat)) }}% used
                    </span>
                  </div>

                  <div class="budget-category-panel__strip">
                    <span>
                      Budget
                      <strong>{{ formatMoney(categoryBucketFor(cat)?.targetAmount ?? 0) }}</strong>
                    </span>
                    <span>
                      Committed
                      <strong>{{ formatMoney(categoryBucketFor(cat)?.committed ?? 0) }}</strong>
                    </span>
                  </div>
                </header>

                <div
                  v-show="isCategoryPanelExpanded(cat.id)"
                  :id="`budget-category-panel-${cat.id}`"
                  class="budget-category-panel__body"
                >
                  <div class="table-responsive budget-line-table-wrap">
                    <table class="table budget-line-table align-middle mb-0">
                      <thead>
                        <tr>
                          <th scope="col" class="budget-line-table__th-expense">Expense</th>
                          <th scope="col" class="text-end budget-line-table__th-num">Planned / mo</th>
                          <th scope="col" class="text-end budget-line-table__th-num">% income</th>
                          <th scope="col" class="text-end budget-line-table__th-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <template
                          v-for="sub in groupedSubcategories[cat.id] || []"
                          :key="sub.id"
                        >
                          <tr
                            v-if="editingSubId !== sub.id && loggingPurchaseSubId !== sub.id"
                            class="budget-line-row"
                          >
                            <td class="budget-line-row__expense">
                              <div class="budget-line-row__top">
                                <span class="budget-line-row__name">{{ sub.label }}</span>
                                <span class="budget-line-row__badges">
                                  <span class="expense-type-badge">
                                    {{ sub.isFlexible ? 'Variable' : 'Fixed' }}
                                  </span>
                                  <span
                                    v-if="(sub.spreadMonths ?? 1) > 1"
                                    class="expense-spread-badge"
                                  >
                                    {{ sub.spreadMonths }} mo spread
                                  </span>
                                </span>
                              </div>
                              <p
                                v-if="lineItemPlannedNote(sub)"
                                class="budget-line-row__note"
                                :title="lineItemPlannedNote(sub) ?? undefined"
                              >
                                {{ lineItemPlannedNote(sub) }}
                              </p>
                            </td>
                            <td class="text-end budget-line-row__planned">
                              <span class="budget-line-row__money">
                                {{ lineItemPlannedPrimary(sub) }}
                              </span>
                              <span class="budget-line-row__suffix">
                                {{ lineItemPlannedSuffix(sub) }}
                              </span>
                            </td>
                            <td class="text-end budget-line-row__pct">
                              {{ formatPercent(percentOfBudget(sub)) }}%
                            </td>
                            <td class="text-end budget-line-table__actions-cell">
                              <div class="budget-line-actions">
                                <button
                                  type="button"
                                  class="btn btn-sm budget-line-action budget-line-action--log"
                                  @click="startLogPurchase(sub)"
                                >
                                  Log
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-sm budget-line-action budget-line-action--edit"
                                  @click="startEditSub(sub)"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-sm budget-line-action budget-line-action--remove"
                                  @click="deleteSubcategoryItem(sub)"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr
                            v-else-if="loggingPurchaseSubId === sub.id"
                            class="budget-line-row budget-line-row--form"
                          >
                            <td colspan="4">
                              <form
                                class="category-line-form budget-line-form"
                                @submit.prevent="submitPurchase(sub)"
                              >
                      <div class="category-line-form__full category-line-form__header">
                        <span class="fw-semibold">Log purchase · {{ sub.label }}</span>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary"
                          @click="cancelSubForm"
                        >
                          Cancel
                        </button>
                      </div>
                      <div>
                        <label class="form-label">
                          Amount
                          <input
                            v-model.number="purchaseAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            class="form-control form-control-sm"
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label class="form-label">
                          Spread (mo)
                          <input
                            v-model.number="purchaseSpreadMonths"
                            type="number"
                            min="1"
                            max="60"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div class="category-line-form__full">
                        <label class="form-label">
                          Note
                          <input
                            v-model="purchaseLabel"
                            type="text"
                            class="form-control form-control-sm"
                            placeholder="What you bought"
                          />
                        </label>
                      </div>
                      <div class="category-line-form__full">
                        <label class="form-label d-block">
                          Vendor / business
                          <VendorPicker
                            v-model="purchaseMerchant"
                            :vendors="knownVendors"
                            size="sm"
                          />
                        </label>
                      </div>
                      <div class="category-line-form__full category-line-form__actions">
                        <button type="submit" class="btn btn-sm btn-primary">Save purchase</button>
                      </div>
                              </form>
                            </td>
                          </tr>
                          <tr v-else class="budget-line-row budget-line-row--form">
                            <td colspan="4">
                              <form
                                class="category-line-form budget-line-form"
                                @submit.prevent="submitEditSubcategory(cat)"
                              >
                      <div class="category-line-form__full category-line-form__header">
                        <span class="fw-semibold">Edit · {{ sub.label }}</span>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-secondary"
                          @click="cancelSubForm"
                        >
                          Cancel
                        </button>
                      </div>
                      <div class="category-line-form__full">
                        <label class="form-label">
                          Name
                          <input
                            v-model="newLabel"
                            type="text"
                            class="form-control form-control-sm"
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label class="form-label">
                          Type
                          <select v-model="newType" class="form-select form-select-sm">
                            <option value="fixed">Fixed</option>
                            <option value="variable">Variable</option>
                          </select>
                        </label>
                      </div>
                      <div>
                        <label class="form-label">
                          Target %
                          <input
                            v-model.number="newTargetPercent"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div v-if="newType === 'fixed'" class="category-line-form__full">
                        <label class="form-label">
                          Total amount
                          <input
                            v-model.number="newTargetAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div v-if="newType === 'fixed'">
                        <label class="form-label">
                          Spread (mo)
                          <input
                            v-model.number="newSpreadMonths"
                            type="number"
                            min="1"
                            max="60"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div v-if="newType === 'fixed' && newSpreadMonths > 1">
                        <label class="form-label">
                          Starts
                          <input
                            v-model="newSpreadStartMonth"
                            type="month"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div v-if="newType === 'variable'">
                        <label class="form-label">
                          Min
                          <input
                            v-model.number="newMinAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div v-if="newType === 'variable'">
                        <label class="form-label">
                          Max
                          <input
                            v-model.number="newMaxAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div class="category-line-form__full category-line-form__actions">
                        <button type="submit" class="btn btn-sm btn-success">Save changes</button>
                      </div>
                              </form>
                            </td>
                          </tr>
                        </template>

                        <tr v-if="!(groupedSubcategories[cat.id] || []).length">
                          <td colspan="4" class="budget-line-table__empty">
                            No line items yet — add expenses to see how this bucket fills up.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <footer class="budget-category-panel__footer">
                <button
                  type="button"
                  class="btn btn-sm budget-category-panel__add"
                  @click="startAddFor(cat.id)"
                >
                  + Add expense
                </button>

                <form
                  v-if="editingCategoryId === cat.id"
                  class="category-line-form budget-line-form budget-category-panel__add-form"
                  @submit.prevent="submitSubcategory(cat)"
                >
                  <div class="category-line-form__full">
                    <label class="form-label">
                      Name
                      <input
                        v-model="newLabel"
                        type="text"
                        class="form-control form-control-sm"
                        placeholder="Rent, groceries, etc."
                      />
                    </label>
                  </div>
                  <div>
                    <label class="form-label">
                      Type
                      <select v-model="newType" class="form-select form-select-sm">
                        <option value="fixed">Fixed</option>
                        <option value="variable">Variable</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <label class="form-label">
                      Target %
                      <input
                        v-model.number="newTargetPercent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        class="form-control form-control-sm"
                        placeholder="10"
                      />
                    </label>
                  </div>
                  <div v-if="newType === 'fixed'" class="category-line-form__full">
                    <label class="form-label">
                      Total amount
                      <input
                        v-model.number="newTargetAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control form-control-sm"
                        placeholder="800"
                      />
                    </label>
                  </div>
                  <div v-if="newType === 'fixed'">
                    <label class="form-label">
                      Spread (mo)
                      <input
                        v-model.number="newSpreadMonths"
                        type="number"
                        min="1"
                        max="60"
                        step="1"
                        class="form-control form-control-sm"
                        placeholder="1"
                      />
                    </label>
                  </div>
                  <div v-if="newType === 'fixed' && newSpreadMonths > 1">
                    <label class="form-label">
                      Starts
                      <input
                        v-model="newSpreadStartMonth"
                        type="month"
                        class="form-control form-control-sm"
                      />
                    </label>
                  </div>
                  <div
                    v-if="newType === 'fixed' && previewMonthlyFromForm() != null && newSpreadMonths > 1"
                    class="category-line-form__full"
                  >
                    <p class="small expense-monthly-impact mb-0">
                      Impact:
                      <strong>{{ formatMoney(previewMonthlyFromForm()!) }}/mo</strong>
                    </p>
                  </div>
                  <div v-if="newType === 'variable'">
                    <label class="form-label">
                      Min
                      <input
                        v-model.number="newMinAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control form-control-sm"
                        placeholder="100"
                      />
                    </label>
                  </div>
                  <div v-if="newType === 'variable'">
                    <label class="form-label">
                      Max
                      <input
                        v-model.number="newMaxAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        class="form-control form-control-sm"
                        placeholder="300"
                      />
                    </label>
                  </div>
                  <div class="category-line-form__full category-line-form__actions">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      @click="cancelSubForm"
                    >
                      Cancel
                    </button>
                    <button type="submit" class="btn btn-sm btn-success">Save expense</button>
                  </div>
                </form>
                  </footer>
                </div>
              </section>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  </div>
</template>

