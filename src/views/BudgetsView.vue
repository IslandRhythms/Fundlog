<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useDomainStore } from '../stores/domain';
import ExtraIncomeModal from '../components/ExtraIncomeModal.vue';
import PageTabs from '../components/PageTabs.vue';
import { showBsModal } from '../shared/hideBsModal';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import CollapsibleSection from '../components/CollapsibleSection.vue';
import BudgetPieCompare from '../components/BudgetPieCompare.vue';
import VendorPicker from '../components/VendorPicker.vue';
import LeftoverLedger from '../components/LeftoverLedger.vue';
import { computeLeftoverLedger } from '../shared/leftoverLedger';
import {
  computePlannedExpenseBarSegments,
  buildPieSegments,
  plannedAmountFromSub,
  plannedTotalFromSub,
  purchasesForSub,
} from '../shared/plannedExpenseBar';
import { computeBudgetHeadroom } from '../shared/budgetHeadroom';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { calendarMonthNow, localDateIso } from '../shared/calendarMonth';
import { confirmAction } from '../shared/confirmAction';
import { monthlyPortion, spreadMonthsLabel } from '../shared/monthSpread';
import { nextDueDateForSub, upcomingDuesFromSubs } from '../shared/recurringDue';
import type { BudgetCategory, BudgetSubcategory, Profile, Transaction } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const viewingMonth = ref(calendarMonthNow());

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
const newSpreadStartMonth = ref(viewingMonth.value);
const newNextDueDate = ref('');
/** When true, fixed line is split across multiple months (spreadMonths > 1). */
const isRecurring = ref(false);

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
  const [y, m] = viewingMonth.value.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
});

const route = useRoute();
const router = useRouter();
const EXTRA_INCOME_MODAL_ID = 'extraIncomeModal';

type BudgetTab = 'overview' | 'lineItems' | 'left';
const BUDGET_TABS: { key: BudgetTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'lineItems', label: 'Line items' },
  { key: 'left', label: 'What’s left' },
];
const budgetTab = ref<BudgetTab>('overview');

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await loadCategories();
  if (route.query.extraIncome) {
    await router.replace({ query: { ...route.query, extraIncome: undefined } });
    await nextTick();
    showBsModal(EXTRA_INCOME_MODAL_ID);
  }
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
  viewingMonth.value = calendarMonthNow();
  const result = await window.fundlog.category.listByBudget(activeBudget.value.id);
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  const month = viewingMonth.value;
  const [unexpected, purchases, goalContrib] = await Promise.all([
    window.fundlog.transaction.listUnexpected(
      domain.activeProfileId,
      activeBudget.value.id,
      month,
    ),
    window.fundlog.transaction.listPurchases(
      domain.activeProfileId,
      activeBudget.value.id,
      month,
    ),
    window.fundlog.transaction.listGoalContributions(
      domain.activeProfileId,
      activeBudget.value.id,
      month,
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
  const amt = plannedAmountFromSub(sub, viewingMonth.value);
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
  return categoryPanelExpanded.value[catId] !== false;
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

/** Purchases + unexpected expenses logged against this category this month (reduces "left"). */
function categorySpent(cat: BudgetCategory) {
  const bucket = categoryBucketFor(cat);
  return (bucket?.purchases ?? 0) + (bucket?.unexpected ?? 0);
}

function categorySpentTitle(cat: BudgetCategory) {
  const bucket = categoryBucketFor(cat);
  return `${formatMoney(bucket?.purchases ?? 0)} purchases · ${formatMoney(bucket?.unexpected ?? 0)} unexpected`;
}

function categoryPlannedPct(cat: BudgetCategory) {
  const planned = categoryBucketFor(cat)?.planned ?? 0;
  if (!planningMonthIncome.value || planned <= 0) return 0;
  return (planned / planningMonthIncome.value) * 100;
}

function lineItemPurchases(sub: BudgetSubcategory) {
  return purchasesForSub(sub.id, purchaseTxs.value, viewingMonth.value);
}

const lineItemTotals = computed(() =>
  categories.value.reduce(
    (sum, cat) => {
      const bucket = categoryBucketFor(cat);
      return {
        planned: sum.planned + (bucket?.planned ?? 0),
        spent: sum.spent + categorySpent(cat),
      };
    },
    { planned: 0, spent: 0 },
  ),
);

const plannedBarResult = computed(() =>
  computePlannedExpenseBarSegments(
    categories.value,
    groupedSubcategories.value,
    subcategories.value,
    unexpectedTxs.value,
    purchaseTxs.value,
    goalContributionTxs.value,
    planningMonthIncome.value,
    viewingMonth.value,
  ),
);

const headroom = computed(() =>
  computeBudgetHeadroom(categories.value, plannedBarResult.value, planningMonthIncome.value),
);

const leftoverLedger = computed(() =>
  computeLeftoverLedger(
    categories.value,
    subcategories.value,
    purchaseTxs.value,
    unexpectedTxs.value,
    goalContributionTxs.value,
    viewingMonth.value,
  ),
);

const pieSegments = computed(() =>
  buildPieSegments(plannedBarResult.value, planningMonthIncome.value),
);

const allocationRows = computed(() =>
  plannedBarResult.value.categoryParts.map((part) => {
    const spent = part.purchases + part.unexpected;
    return {
      categoryId: part.categoryId,
      label: part.label,
      color: part.color,
      planned: part.planned,
      spent,
      goalSavings: part.goalSavings,
      total: part.planned + spent + part.goalSavings,
      pctOfIncome: part.pctOfIncome,
    };
  }),
);

const allocationTotals = computed(() =>
  allocationRows.value.reduce(
    (sum, row) => ({
      planned: sum.planned + row.planned,
      spent: sum.spent + row.spent,
      goalSavings: sum.goalSavings + row.goalSavings,
      total: sum.total + row.total,
    }),
    { planned: 0, spent: 0, goalSavings: 0, total: 0 },
  ),
);

/** Positive when committed exceeds income (the pie scales slices down to fit). */
const allocationOverIncome = computed(
  () => allocationTotals.value.total - planningMonthIncome.value,
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

const upcomingDues = computed(() =>
  upcomingDuesFromSubs(
    subcategories.value,
    localDateIso(),
    30,
    viewingMonth.value,
  ),
);

function resetSubForm() {
  newLabel.value = '';
  newType.value = 'fixed';
  newTargetPercent.value = null;
  newTargetAmount.value = null;
  newMinAmount.value = null;
  newMaxAmount.value = null;
  newSpreadMonths.value = 1;
  newSpreadStartMonth.value = viewingMonth.value;
  newNextDueDate.value = '';
  isRecurring.value = false;
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
  try {
    await window.fundlog.transaction.createManual({
      profileId: domain.activeProfileId,
      budgetId: activeBudget.value.id,
      subcategoryId: sub.id,
      date: localDateIso(),
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
  isRecurring.value = newSpreadMonths.value > 1;
  newSpreadStartMonth.value = sub.spreadStartMonth ?? viewingMonth.value;
  newNextDueDate.value =
    nextDueDateForSub(sub, localDateIso()) ?? sub.nextDueDate ?? '';
}

function onRecurringToggle() {
  if (isRecurring.value && newSpreadMonths.value <= 1) {
    newSpreadMonths.value = 12;
    if (!newSpreadStartMonth.value) {
      newSpreadStartMonth.value = viewingMonth.value;
    }
  }
}

function effectiveSpreadMonths(): number {
  if (newType.value !== 'fixed' || !isRecurring.value) return 1;
  return Math.max(2, Math.floor(newSpreadMonths.value || 2));
}

async function submitEditSubcategory(category: BudgetCategory) {
  if (!activeBudget.value || !editingSubId.value || !newLabel.value.trim()) return;
  const spreadMonths = effectiveSpreadMonths();
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
    nextDueDate: newType.value === 'fixed' ? normalizeNextDueInput(newNextDueDate.value) : null,
    dueDay: newType.value === 'fixed' ? dueDayFromNextDueInput(newNextDueDate.value) : null,
  });
  categories.value = result.categories;
  subcategories.value = result.subcategories;
  cancelSubForm();
}

async function deleteSubcategoryItem(sub: BudgetSubcategory) {
  if (!activeBudget.value) return;
  const ok = await confirmAction(`Remove "${sub.label}" from this budget?`, {
    title: 'Remove expense',
  });
  if (!ok) return;
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
  const parts: string[] = [];
  if (spread > 1) {
    const total = plannedTotalFromSub(sub);
    const monthly = plannedAmountFromSub(sub, viewingMonth.value);
    if (monthly <= 0) {
      parts.push(
        `${formatMoney(total)} every ${spreadMonthsLabel(spread)} (starts later)`,
      );
    } else {
      parts.push(
        `${formatMoney(total)} every ${spreadMonthsLabel(spread)} → ${formatMoney(monthly)}/mo`,
      );
    }
  }
  const nextDue = nextDueDateForSub(sub, localDateIso());
  if (nextDue) {
    parts.push(`next due ${nextDue}`);
  } else if (sub.dueDay != null) {
    parts.push(`due day ${sub.dueDay}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function lineItemPlannedPrimary(sub: BudgetSubcategory): string {
  if (sub.isFlexible) {
    const min = sub.minAmount ?? 0;
    const max = sub.maxAmount ?? min;
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }
  return formatMoney(plannedAmountFromSub(sub, viewingMonth.value));
}

function lineItemPlannedSuffix(sub: BudgetSubcategory): string {
  return sub.isFlexible ? '/mo range' : '/mo';
}

function lineItemPlannedNote(sub: BudgetSubcategory): string | null {
  if (sub.isFlexible) return null;
  return subSpreadHint(sub);
}

function normalizeNextDueInput(value: string): string | null {
  const raw = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function dueDayFromNextDueInput(value: string): number | null {
  const next = normalizeNextDueInput(value);
  if (!next) return null;
  const day = Number(next.slice(8, 10));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

function previewMonthlyFromForm(): number | null {
  if (newType.value === 'fixed' && newTargetAmount.value != null && newTargetAmount.value > 0) {
    return monthlyPortion(newTargetAmount.value, effectiveSpreadMonths());
  }
  return null;
}

async function submitSubcategory(category: BudgetCategory) {
  if (!activeBudget.value || !newLabel.value.trim()) return;
  const spreadMonths = effectiveSpreadMonths();
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
    nextDueDate: newType.value === 'fixed' ? normalizeNextDueInput(newNextDueDate.value) : null,
    dueDay: newType.value === 'fixed' ? dueDayFromNextDueInput(newNextDueDate.value) : null,
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
      <div
        v-else
        class="budgets-page-header__meta d-flex flex-wrap align-items-center gap-2"
      >
        <span>Planning <strong>{{ activeBudget.name }}</strong></span>
        <RouterLink to="/budget-records" class="btn btn-sm btn-outline-secondary py-0">
          Manage budgets
        </RouterLink>
      </div>
    </header>

    <div v-if="activeBudget" class="row g-3">
      <div v-if="upcomingDues.length" class="col-12">
        <div class="card border shadow-none">
          <div class="card-body px-3 py-2 d-flex flex-wrap align-items-center gap-2 small">
            <span class="fw-semibold">Upcoming dues (30 days):</span>
            <span
              v-for="due in upcomingDues"
              :key="due.subcategoryId"
              class="border rounded-pill px-2 py-1 bg-body-tertiary text-nowrap"
              :title="`Due ${due.dueDate} · ${formatMoney(due.amount)} per cycle`"
            >
              {{ due.label }} · {{ formatMoney(due.amount) }} ·
              {{ due.daysUntil === 0 ? 'today' : `in ${due.daysUntil}d` }}
            </span>
          </div>
        </div>
      </div>

      <div class="col-12">
        <PageTabs
          v-model="budgetTab"
          :tabs="BUDGET_TABS"
          storage-key="budgets"
          label="Budget sections"
        />
      </div>

      <div v-if="budgetTab === 'lineItems'" class="col-12">
        <CollapsibleSection
          title="Line items by category"
          :meta="`${formatMoney(headroom.moneyLeft)} left of ${formatMoney(planningMonthIncome)} · ${monthLabel}`"
          storage-key="budgets-line-items"
        >
          <p class="line-items-intro mb-2">
            You have <strong>{{ formatMoney(headroom.moneyLeft) }}</strong> left of your
            {{ formatMoney(planningMonthIncome) }} to work with this month — planned amounts,
            purchases, unexpected expenses, and goal savings all draw it down. Click a category
            row to show or hide its line items. Unexpected spending goes on
            <RouterLink to="/expenses">Expenses</RouterLink>.
          </p>
          <div class="budgets-table-wrap">
            <table class="table align-middle budgets-table">
              <thead>
                <tr>
                  <th scope="col">Expense</th>
                  <th scope="col" class="budgets-table__num">Planned / mo</th>
                  <th scope="col" class="budgets-table__num">% income</th>
                  <th
                    scope="col"
                    class="budgets-table__num"
                    title="Purchases and unexpected expenses this month"
                  >
                    Spent
                  </th>
                  <th scope="col" class="budgets-table__num">Left</th>
                  <th scope="col" class="budgets-table__num">
                    <span class="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody v-for="cat in categories" :key="cat.id">
                <tr
                  class="budgets-table__group"
                  :style="{ '--category-accent': cat.color }"
                >
                  <th scope="rowgroup">
                    <button
                      type="button"
                      class="btn btn-link p-0 text-reset text-decoration-none fw-semibold d-inline-flex align-items-center gap-2 text-nowrap"
                      :aria-expanded="isCategoryPanelExpanded(cat.id)"
                      @click="toggleCategoryPanel(cat.id)"
                    >
                      <span
                        class="budgets-collapse-chevron"
                        :class="{
                          'budgets-collapse-chevron--collapsed': !isCategoryPanelExpanded(cat.id),
                        }"
                        aria-hidden="true"
                      />
                      <span
                        class="budgets-table__swatch rounded-circle"
                        :style="{ backgroundColor: cat.color }"
                        aria-hidden="true"
                      />
                      {{ cat.label }}
                    </button>
                    <div class="budgets-table__sub">
                      {{ cat.targetPercent }}% target ·
                      {{ categoryLineCount(cat.id) }}
                      {{ categoryLineCount(cat.id) === 1 ? 'item' : 'items' }}
                    </div>
                  </th>
                  <td class="budgets-table__num fw-semibold">
                    {{ formatMoney(categoryBucketFor(cat)?.planned ?? 0) }}
                  </td>
                  <td class="budgets-table__num">
                    {{ formatPercent(categoryPlannedPct(cat)) }}%
                  </td>
                  <td
                    class="budgets-table__num"
                    :class="{ 'budgets-table__zero': categorySpent(cat) <= 0 }"
                    :title="categorySpentTitle(cat)"
                  >
                    {{ formatMoney(categorySpent(cat)) }}
                  </td>
                  <td class="budgets-table__num">
                    <span
                      class="fw-semibold"
                      :class="{ 'text-danger': (categoryBucketFor(cat)?.remaining ?? 0) < 0 }"
                    >
                      {{ formatMoney(categoryBucketFor(cat)?.remaining ?? 0) }}
                    </span>
                    <div class="budgets-table__sub">
                      of {{ formatMoney(categoryBucketFor(cat)?.targetAmount ?? 0) }}
                    </div>
                    <div
                      class="progress budgets-table__meter mt-1"
                      role="progressbar"
                      :aria-valuenow="categoryUsedPct(cat)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      :aria-label="`${cat.label} budget used`"
                    >
                      <div
                        class="progress-bar"
                        :style="{ width: categoryUsedPct(cat) + '%', backgroundColor: cat.color }"
                      />
                    </div>
                  </td>
                  <td class="budgets-table__num">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      @click="startAddFor(cat.id)"
                    >
                      + Add
                    </button>
                  </td>
                </tr>
                <template v-if="isCategoryPanelExpanded(cat.id)">
                        <template
                          v-for="sub in groupedSubcategories[cat.id] || []"
                          :key="sub.id"
                        >
                          <tr
                            v-if="editingSubId !== sub.id && loggingPurchaseSubId !== sub.id"
                            class="budgets-table__line"
                          >
                            <td>
                              {{ sub.label }}
                              <div class="budgets-table__sub">
                                {{ sub.isFlexible ? 'Variable' : 'Fixed' }}
                                <template v-if="lineItemPlannedNote(sub)">
                                  · {{ lineItemPlannedNote(sub) }}
                                </template>
                              </div>
                            </td>
                            <td class="budgets-table__num">
                              {{ lineItemPlannedPrimary(sub) }}
                              <div class="budgets-table__sub">
                                {{ lineItemPlannedSuffix(sub) }}
                              </div>
                            </td>
                            <td class="budgets-table__num">
                              {{ formatPercent(percentOfBudget(sub)) }}%
                            </td>
                            <td
                              class="budgets-table__num"
                              :class="{ 'budgets-table__zero': lineItemPurchases(sub) <= 0 }"
                              title="Purchases logged on this line this month"
                            >
                              {{ formatMoney(lineItemPurchases(sub)) }}
                            </td>
                            <td />
                            <td class="budgets-table__num">
                              <button
                                type="button"
                                class="btn btn-link btn-sm px-1 text-decoration-none"
                                @click="startLogPurchase(sub)"
                              >
                                Log
                              </button>
                              <button
                                type="button"
                                class="btn btn-link btn-sm px-1 text-decoration-none link-secondary"
                                @click="startEditSub(sub)"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                class="btn btn-link btn-sm px-1 text-decoration-none link-danger"
                                @click="deleteSubcategoryItem(sub)"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                          <tr
                            v-else-if="loggingPurchaseSubId === sub.id"
                            class="budgets-table__form"
                          >
                            <td colspan="6">
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
                          <tr v-else class="budgets-table__form">
                            <td colspan="6">
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
                      <div v-if="newType === 'fixed'" class="category-line-form__full">
                        <div class="form-check">
                          <input
                            id="edit-sub-recurring"
                            v-model="isRecurring"
                            class="form-check-input"
                            type="checkbox"
                            @change="onRecurringToggle"
                          />
                          <label class="form-check-label" for="edit-sub-recurring">
                            Recurring / multi-month
                          </label>
                        </div>
                        <p class="form-text small mb-0">
                          Unchecked = monthly amount. Checked = split a total across
                          several months.
                        </p>
                      </div>
                      <div v-if="newType === 'fixed' && isRecurring">
                        <label class="form-label">
                          Every (mo)
                          <input
                            v-model.number="newSpreadMonths"
                            type="number"
                            min="2"
                            max="60"
                            class="form-control form-control-sm"
                          />
                        </label>
                      </div>
                      <div
                        v-if="newType === 'fixed' && isRecurring"
                        class="category-line-form__full"
                      >
                        <label class="form-label">
                          Starts
                          <input
                            v-model="newSpreadStartMonth"
                            type="month"
                            class="form-control form-control-sm"
                          />
                        </label>
                        <p class="form-text small mb-0">
                          Total is split across each {{ effectiveSpreadMonths() }}-month
                          cycle and renews.
                        </p>
                      </div>
                      <div v-if="newType === 'fixed'" class="category-line-form__full">
                        <label class="form-label">
                          Next due date
                          <input
                            v-model="newNextDueDate"
                            type="date"
                            class="form-control form-control-sm"
                          />
                        </label>
                        <p class="form-text small mb-0">
                          Set or change the next due date for this bill. After it
                          passes, it advances by the
                          {{ isRecurring ? 'Every (mo)' : 'monthly' }} interval. Leave
                          blank if none.
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

                        <tr
                          v-if="
                            !(groupedSubcategories[cat.id] || []).length &&
                            editingCategoryId !== cat.id
                          "
                        >
                          <td colspan="6" class="budgets-table__empty">
                            No line items yet — use + Add to plan an expense here.
                          </td>
                        </tr>

                <tr v-if="editingCategoryId === cat.id" class="budgets-table__form">
                <td colspan="6">
                <form
                  class="category-line-form budget-line-form"
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
                  <div v-if="newType === 'fixed'" class="category-line-form__full">
                    <div class="form-check">
                      <input
                        id="add-sub-recurring"
                        v-model="isRecurring"
                        class="form-check-input"
                        type="checkbox"
                        @change="onRecurringToggle"
                      />
                      <label class="form-check-label" for="add-sub-recurring">
                        Recurring / multi-month
                      </label>
                    </div>
                    <p class="form-text small mb-0">
                      Unchecked = monthly amount. Checked = split a total across
                      several months.
                    </p>
                  </div>
                  <div v-if="newType === 'fixed' && isRecurring">
                    <label class="form-label">
                      Every (mo)
                      <input
                        v-model.number="newSpreadMonths"
                        type="number"
                        min="2"
                        max="60"
                        step="1"
                        class="form-control form-control-sm"
                        placeholder="12"
                      />
                    </label>
                  </div>
                  <div
                    v-if="newType === 'fixed' && isRecurring"
                    class="category-line-form__full"
                  >
                    <label class="form-label">
                      Starts
                      <input
                        v-model="newSpreadStartMonth"
                        type="month"
                        class="form-control form-control-sm"
                      />
                    </label>
                    <p class="form-text small mb-0">
                      Total is split across each {{ effectiveSpreadMonths() }}-month
                      cycle and renews.
                    </p>
                  </div>
                  <div v-if="newType === 'fixed'" class="category-line-form__full">
                    <label class="form-label">
                      Next due date
                      <input
                        v-model="newNextDueDate"
                        type="date"
                        class="form-control form-control-sm"
                      />
                    </label>
                    <p class="form-text small mb-0">
                      Optional. After it passes, advances by the
                      {{ isRecurring ? 'Every (mo)' : 'monthly' }} interval.
                    </p>
                  </div>
                  <div
                    v-if="newType === 'fixed' && previewMonthlyFromForm() != null && isRecurring"
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
                </td>
                </tr>
                </template>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td class="budgets-table__num">
                    {{ formatMoney(lineItemTotals.planned) }}
                  </td>
                  <td class="budgets-table__num">
                    {{
                      planningMonthIncome > 0
                        ? `${formatPercent((lineItemTotals.planned / planningMonthIncome) * 100)}%`
                        : '—'
                    }}
                  </td>
                  <td class="budgets-table__num">
                    {{ formatMoney(lineItemTotals.spent) }}
                  </td>
                  <td
                    class="budgets-table__num"
                    :class="{ 'text-danger': headroom.moneyLeft < 0 }"
                  >
                    {{ formatMoney(headroom.moneyLeft) }}
                    <div class="budgets-table__sub">
                      of {{ formatMoney(planningMonthIncome) }}
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </CollapsibleSection>
      </div>

      <div v-if="budgetTab === 'overview'" class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel"
          title="Budget overview"
          :meta="`${formatMoney(headroom.moneyLeft)} left · ${monthLabel}`"
          storage-key="budgets-money-left"
        >
          <div class="d-flex flex-wrap align-items-center justify-content-end gap-2 mb-3">
            <span class="small text-muted">
              Effective income {{ formatMoney(planningMonthIncome) }}
            </span>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              data-bs-toggle="modal"
              :data-bs-target="`#${EXTRA_INCOME_MODAL_ID}`"
            >
              Extra income
            </button>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-6 col-md-4">
              <div class="budget-stat budget-stat--summary">
                <div class="budget-stat__label">Income to allocate</div>
                <div class="budget-stat__value">{{ formatMoney(planningMonthIncome) }}</div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="budget-stat budget-stat--summary">
                <div class="budget-stat__label">Committed</div>
                <div class="budget-stat__value">{{ formatMoney(headroom.committedTotal) }}</div>
                <div v-if="planningMonthIncome" class="budget-stat__pct">
                  {{ formatPercent(totalPercent) }}% of income
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="budget-stat budget-stat--summary budget-stat--left">
                <div class="budget-stat__label">Left to work with</div>
                <div class="budget-stat__value">{{ formatMoney(headroom.moneyLeft) }}</div>
                <div v-if="planningMonthIncome" class="budget-stat__pct">
                  {{ formatPercent((headroom.moneyLeft / planningMonthIncome) * 100) }}% of income
                </div>
              </div>
            </div>
          </div>

          <h3 class="h6 text-muted mb-2">Where it's committed</h3>
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

      <div v-if="budgetTab === 'overview'" class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel"
          title="Income allocation"
          :meta="`Compare plan vs target · ${monthLabel}`"
          storage-key="budgets-allocation-compare"
        >
          <BudgetPieCompare
            v-if="categories.length"
            :categories="categories"
            :actual-segments="pieSegments"
            :income="planningMonthIncome"
            :currency-code="currencyCode()"
            actual-caption="Planned, purchases, unexpected, and goal savings"
            :target-caption="allocationTargetCaption"
          />
          <template v-if="categories.length && allocationRows.length">
            <div class="budgets-table-wrap mt-3">
              <table class="table align-middle budgets-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" class="budgets-table__num">Planned</th>
                    <th
                      scope="col"
                      class="budgets-table__num"
                      title="Purchases + unexpected expenses"
                    >
                      Spent
                    </th>
                    <th
                      v-if="allocationTotals.goalSavings > 0"
                      scope="col"
                      class="budgets-table__num"
                    >
                      Goal savings
                    </th>
                    <th scope="col" class="budgets-table__num">Total</th>
                    <th scope="col" class="budgets-table__num">% of income</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in allocationRows" :key="row.categoryId">
                    <td>
                      <span class="d-inline-flex align-items-center gap-2">
                        <span
                          class="budgets-table__swatch rounded-circle"
                          :style="{ backgroundColor: row.color }"
                          aria-hidden="true"
                        />
                        {{ row.label }}
                      </span>
                    </td>
                    <td class="budgets-table__num">{{ formatMoney(row.planned) }}</td>
                    <td
                      class="budgets-table__num"
                      :class="{ 'budgets-table__zero': row.spent <= 0 }"
                    >
                      {{ formatMoney(row.spent) }}
                    </td>
                    <td v-if="allocationTotals.goalSavings > 0" class="budgets-table__num">
                      {{ formatMoney(row.goalSavings) }}
                    </td>
                    <td class="budgets-table__num fw-semibold">{{ formatMoney(row.total) }}</td>
                    <td class="budgets-table__num">{{ formatPercent(row.pctOfIncome) }}%</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td class="budgets-table__num">{{ formatMoney(allocationTotals.planned) }}</td>
                    <td class="budgets-table__num">{{ formatMoney(allocationTotals.spent) }}</td>
                    <td v-if="allocationTotals.goalSavings > 0" class="budgets-table__num">
                      {{ formatMoney(allocationTotals.goalSavings) }}
                    </td>
                    <td class="budgets-table__num">{{ formatMoney(allocationTotals.total) }}</td>
                    <td class="budgets-table__num">
                      {{
                        planningMonthIncome > 0
                          ? `${formatPercent((allocationTotals.total / planningMonthIncome) * 100)}%`
                          : '—'
                      }}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p v-if="allocationOverIncome > 0.005" class="small text-danger mt-2 mb-0">
              Over income by {{ formatMoney(allocationOverIncome) }} — the pie scales every slice
              down to fit, so new spending barely changes its shape.
            </p>
            <p v-else-if="planningMonthIncome > 0" class="small text-muted mt-2 mb-0">
              {{ formatMoney(-allocationOverIncome) }} of
              {{ formatMoney(planningMonthIncome) }} not yet allocated.
            </p>
          </template>
          <p v-else-if="!categories.length" class="small mb-0">
            Add expenses to see your spending mix.
          </p>
        </CollapsibleSection>
      </div>

      <div v-if="budgetTab === 'left'" class="col-12">
        <CollapsibleSection
          class="budgets-planning-panel"
          title="What's reducing what's left"
          :meta="`${formatMoney(headroom.moneyLeft)} left · ${leftoverLedger.length} ${leftoverLedger.length === 1 ? 'entry' : 'entries'} · ${monthLabel}`"
          storage-key="budgets-leftover-ledger"
        >
          <LeftoverLedger
            :rows="leftoverLedger"
            :income="planningMonthIncome"
            :currency-code="currencyCode()"
          />
        </CollapsibleSection>
      </div>
    </div>
    <ExtraIncomeModal :modal-id="EXTRA_INCOME_MODAL_ID" />
  </div>
</template>

