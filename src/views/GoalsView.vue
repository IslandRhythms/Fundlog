<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import {
  computePlannedExpenseBarSegments,
  plannedAmountFromSub,
} from '../shared/plannedExpenseBar';
import {
  goalProgressPctWithBudget,
  monthlyPlanTowardGoal,
} from '../shared/goalBudgetProgress';
import { calendarMonthNow } from '../shared/calendarMonth';
import PlannedExpenseCategoryBar from '../components/PlannedExpenseCategoryBar.vue';
import GoalsProgressBarChart from '../components/GoalsProgressBarChart.vue';
import LoadingView from '../components/LoadingView.vue';
import type {
  BudgetCategory,
  BudgetSubcategory,
  Goal,
  GoalAllocation,
  Profile,
  Transaction,
} from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const contributionGoal = ref<Goal | null>(null);
const contributionAmount = ref<number | null>(null);
const contributionDate = ref('');
const contributionDescription = ref('');
const contributionSubmitting = ref(false);

const goalToDelete = ref<Goal | null>(null);
const deleteSubmitting = ref(false);

const name = ref('');
const targetAmount = ref<number | null>(null);
const targetDate = ref('');
const priority = ref(3);
const note = ref('');
const formError = ref<string | null>(null);
const showOnDashboardNew = ref(true);

const editingGoalId = ref<number | null>(null);
const editName = ref('');
const editTargetAmount = ref<number | null>(null);
const editTargetDate = ref('');
const editPriority = ref(3);
const editNote = ref('');
const editShowOnDashboard = ref(true);
const editFormError = ref<string | null>(null);

const categories = ref<BudgetCategory[]>([]);
const subcategories = ref<BudgetSubcategory[]>([]);
const unexpectedTxs = ref<Transaction[]>([]);
const goalContributionTxs = ref<Transaction[]>([]);
const goalAllocations = ref<GoalAllocation[]>([]);
const loadingBudget = ref(false);

const editLinkedSubcategoryIds = ref<number[]>([]);

const priorityOptions: { value: number; label: string }[] = [
  { value: 5, label: '5 — Highest (break ties on Dashboard)' },
  { value: 4, label: '4 — High' },
  { value: 3, label: '3 — Medium' },
  { value: 2, label: '2 — Lower' },
  { value: 1, label: '1 — Lowest' },
];

const activeBudget = computed(() => domain.activeBudget);

const groupedSubcategories = computed(() => {
  const grouped: Record<number, BudgetSubcategory[]> = {};
  for (const sub of subcategories.value) {
    const parentId = sub.parentCategoryId ?? 0;
    if (!grouped[parentId]) grouped[parentId] = [];
    grouped[parentId].push(sub);
  }
  return grouped;
});

/** Budget lines grouped by parent category (for linking goals in Edit goal). */
const subsByParentForEdit = computed(() =>
  [...categories.value]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((cat) => ({
      category: cat,
      subs: subcategories.value
        .filter((s) => s.parentCategoryId === cat.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((x) => x.subs.length > 0),
);

function plannedLineMonthlyAmount(sub: BudgetSubcategory): string {
  return formatMoney(plannedAmountFromSub(sub), currencyCode());
}

function toggleEditLinkedSub(subId: number, checked: boolean) {
  const next = new Set(editLinkedSubcategoryIds.value);
  if (checked) next.add(subId);
  else next.delete(subId);
  editLinkedSubcategoryIds.value = [...next];
}

async function loadBudgetDetails() {
  if (!activeBudget.value || !domain.activeProfileId) {
    categories.value = [];
    subcategories.value = [];
    unexpectedTxs.value = [];
    goalContributionTxs.value = [];
    return;
  }
  loadingBudget.value = true;
  try {
    const result = await window.fundlog.category.listByBudget(activeBudget.value.id);
    categories.value = result.categories;
    subcategories.value = result.subcategories;
    const [unexpected, goalContrib] = await Promise.all([
      window.fundlog.transaction.listUnexpected(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
      window.fundlog.transaction.listGoalContributions(
        domain.activeProfileId,
        activeBudget.value.id,
      ),
    ]);
    unexpectedTxs.value = unexpected;
    goalContributionTxs.value = goalContrib;
  } finally {
    loadingBudget.value = false;
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
  } catch (e) {
    console.error(e);
    goalAllocations.value = [];
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await domain.loadTransactions();
  await domain.loadGoals();
  await loadBudgetDetails();
  await loadGoalAllocations();
});

watch(
  () => domain.activeBudgetId,
  async () => {
    await domain.loadTransactions();
    await loadBudgetDetails();
    await loadGoalAllocations();
  },
);

watch(
  () => domain.activeProfileId,
  async () => {
    await loadGoalAllocations();
  },
);

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const goals = computed(() =>
  [...domain.goals].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.createdAt.localeCompare(a.createdAt);
  }),
);

const dashboardEligibleCount = computed(
  () => goals.value.filter((g) => g.showOnDashboard).length,
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
    goalContributionTxs.value,
    monthlyIncome.value,
  ),
);

const committedTotal = computed(
  () =>
    plannedBarResult.value.totalPlanned +
    plannedBarResult.value.totalUnexpected +
    plannedBarResult.value.totalGoalSavings,
);

const remainingHeadroom = computed(() => monthlyIncome.value - committedTotal.value);

const fuelRingUsedPct = computed(() => {
  const inc = monthlyIncome.value;
  if (!inc || inc <= 0) return 0;
  return Math.min(100, (committedTotal.value / inc) * 100);
});

const isOverCommitted = computed(
  () => monthlyIncome.value > 0 && committedTotal.value > monthlyIncome.value,
);

function formatMoney(amount: number, currencyCode: string) {
  const code = currencyCode?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: code });
  } catch {
    return `${amount.toLocaleString()} ${code}`;
  }
}

function currencyCode() {
  return activeProfile.value?.currencyCode?.trim() || 'USD';
}

function savedTowardGoal(goalId: number): number {
  return domain.transactions
    .filter((t) => t.goalId === goalId)
    .reduce((sum, t) => sum + t.amount, 0);
}

function goalContributionRoom(g: Goal): number {
  return Math.max(0, g.targetAmount - savedTowardGoal(g.id));
}

function isGoalTargetFullyFunded(g: Goal): boolean {
  if (g.targetAmount <= 0) return true;
  return savedTowardGoal(g.id) + 1e-9 >= g.targetAmount;
}

const contributionRemaining = computed(() => {
  const g = contributionGoal.value;
  if (!g) return 0;
  return goalContributionRoom(g);
});

/** Whole months from now until the target month (at least 1). */
function monthsRemainingToDate(iso: string): number | null {
  const end = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  if (end <= now) return 1;
  let months =
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  if (end.getDate() < now.getDate()) months -= 1;
  return Math.max(1, months);
}

type GoalPace = {
  saved: number;
  progressPct: number;
  monthsLeft: number | null;
  neededPerMonth: number | null;
  remainingToFund: number;
};

function paceForGoal(g: Goal): GoalPace {
  const saved = savedTowardGoal(g.id);
  const remainingToFund = Math.max(0, g.targetAmount - saved);
  const progressPct = g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0;
  if (!g.targetDate) {
    return { saved, progressPct, monthsLeft: null, neededPerMonth: null, remainingToFund };
  }
  const monthsLeft = monthsRemainingToDate(g.targetDate);
  if (monthsLeft == null) {
    return { saved, progressPct, monthsLeft: null, neededPerMonth: null, remainingToFund };
  }
  const neededPerMonth = remainingToFund / monthsLeft;
  return { saved, progressPct, monthsLeft, neededPerMonth, remainingToFund };
}

function paceStatusClass(pace: GoalPace): string {
  if (pace.neededPerMonth == null || pace.monthsLeft == null) return 'text-muted';
  if (pace.remainingToFund <= 0) return 'text-success';
  if (remainingHeadroom.value >= pace.neededPerMonth) return 'text-success';
  if (remainingHeadroom.value >= 0) return 'text-warning';
  return 'text-danger';
}

const goalRows = computed(() =>
  goals.value.map((goal) => {
    const pace = paceForGoal(goal);
    const planThisMonth = monthlyPlanTowardGoal(
      goal.id,
      goalAllocations.value,
      subcategories.value,
    );
    const pctWithBudget = goalProgressPctWithBudget(
      goal,
      pace.saved,
      goalAllocations.value,
      subcategories.value,
    );
    return { goal, pace, planThisMonth, pctWithBudget };
  }),
);

const goalChartLabelMaxLen = 40;

const goalChartSegments = computed(() =>
  goals.value.map((g) => {
    const pace = paceForGoal(g);
    const planThisMonth = monthlyPlanTowardGoal(
      g.id,
      goalAllocations.value,
      subcategories.value,
    );
    const pctWithBudget = goalProgressPctWithBudget(
      g,
      pace.saved,
      goalAllocations.value,
      subcategories.value,
    );
    const name = g.name.trim() || 'Goal';
    const label =
      name.length > goalChartLabelMaxLen
        ? `${name.slice(0, goalChartLabelMaxLen - 1)}…`
        : name;
    return {
      label,
      fullLabel: name,
      progressPct: pctWithBudget,
      saved: pace.saved,
      target: g.targetAmount,
      planThisMonth,
    };
  }),
);

function formatTargetDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function resetGoalForm() {
  formError.value = null;
  name.value = '';
  targetAmount.value = null;
  targetDate.value = '';
  priority.value = 3;
  note.value = '';
  showOnDashboardNew.value = true;
}

function openCreateGoalModal() {
  resetGoalForm();
}

function goalDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? m[1] : iso.slice(0, 10);
}

function openEditGoalModal(g: Goal) {
  editingGoalId.value = g.id;
  editName.value = g.name;
  editTargetAmount.value = g.targetAmount;
  editTargetDate.value = goalDateInputValue(g.targetDate);
  editPriority.value = g.priority;
  editNote.value = g.note ?? '';
  editShowOnDashboard.value = g.showOnDashboard;
  editFormError.value = null;
  editLinkedSubcategoryIds.value = goalAllocations.value
    .filter((a) => a.goalId === g.id)
    .map((a) => a.subcategoryId);
}

function onEditGoalModalHidden() {
  editingGoalId.value = null;
  editFormError.value = null;
  editLinkedSubcategoryIds.value = [];
}

async function submitEdit() {
  editFormError.value = null;
  const id = editingGoalId.value;
  if (id == null) return;
  if (!editName.value?.trim()) {
    editFormError.value = 'Enter a short name for this goal.';
    return;
  }
  if (
    editTargetAmount.value == null ||
    editTargetAmount.value <= 0 ||
    !Number.isFinite(editTargetAmount.value)
  ) {
    editFormError.value = 'Enter a positive target amount.';
    return;
  }
  const ok = await domain.updateGoal({
    id,
    name: editName.value.trim(),
    targetAmount: editTargetAmount.value,
    targetDate: editTargetDate.value.trim() || null,
    priority: editPriority.value,
    note: editNote.value.trim() || null,
    showOnDashboard: editShowOnDashboard.value,
  });
  if (!ok) return;
  if (!domain.activeProfileId) return;
  try {
    await window.fundlog.goalAllocation.setForGoal({
      goalId: id,
      profileId: domain.activeProfileId,
      items: editLinkedSubcategoryIds.value.map((subcategoryId) => ({
        subcategoryId,
        percent: null as number | null,
      })),
    });
    await loadGoalAllocations();
  } catch (e) {
    console.error(e);
    toast.error('Goal saved, but budget links could not be updated.');
    return;
  }
  hideBsModal('editGoalModal');
  editingGoalId.value = null;
}

async function submit() {
  formError.value = null;
  if (!name.value?.trim()) {
    formError.value = 'Enter a short name for this goal.';
    return;
  }
  if (targetAmount.value == null || targetAmount.value <= 0 || !Number.isFinite(targetAmount.value)) {
    formError.value = 'Enter a positive target amount.';
    return;
  }
  const ok = await domain.createGoal({
    name: name.value.trim(),
    targetAmount: targetAmount.value,
    targetDate: targetDate.value || null,
    priority: priority.value,
    note: note.value.trim() || null,
    showOnDashboard: showOnDashboardNew.value,
  });
  if (!ok) return;
  resetGoalForm();
  hideBsModal('createGoalModal');
}

function priorityLabel(p: number) {
  const o = priorityOptions.find((x) => x.value === p);
  return o ? o.label.split(' — ')[1] ?? `Priority ${p}` : `Priority ${p}`;
}

async function onGoalDashboardToggle(g: Goal, ev: Event) {
  const el = ev.target as HTMLInputElement;
  const next = el.checked;
  const ok = await domain.updateGoal({ id: g.id, showOnDashboard: next });
  if (!ok) el.checked = !next;
}

async function onGoalPriorityChange(g: Goal, ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const prev = g.priority;
  const next = Number(el.value);
  if (!Number.isFinite(next) || next < 1 || next > 5) {
    el.value = String(prev);
    return;
  }
  const ok = await domain.updateGoal({ id: g.id, priority: next });
  if (!ok) el.value = String(prev);
}

function openRecordContributionModal(g: Goal) {
  contributionGoal.value = g;
  contributionAmount.value = null;
  contributionDate.value = new Date().toISOString().slice(0, 10);
  contributionDescription.value = '';
}

function onContributionModalHidden() {
  contributionGoal.value = null;
  contributionAmount.value = null;
  contributionDate.value = '';
  contributionDescription.value = '';
  contributionSubmitting.value = false;
}

function openDeleteGoalModal(g: Goal) {
  goalToDelete.value = g;
}

function onDeleteGoalModalHidden() {
  goalToDelete.value = null;
  deleteSubmitting.value = false;
}

async function confirmDeleteGoal() {
  const g = goalToDelete.value;
  if (!g || deleteSubmitting.value) return;
  deleteSubmitting.value = true;
  const ok = await domain.deleteGoal(g.id);
  deleteSubmitting.value = false;
  if (ok) {
    await loadGoalAllocations();
    hideBsModal('deleteGoalModal');
  }
}

async function submitRecordContribution() {
  const g = contributionGoal.value;
  const b = activeBudget.value;
  const pid = domain.activeProfileId;
  if (!g || !b || !pid) return;
  if (
    contributionAmount.value == null ||
    contributionAmount.value <= 0 ||
    !Number.isFinite(contributionAmount.value)
  ) {
    toast.error('Enter a positive amount.');
    return;
  }
  const room = goalContributionRoom(g);
  if (room <= 1e-9) {
    toast.error("This goal's target is already met. Raise the target on the goal to add more.");
    return;
  }
  if (contributionAmount.value > room + 1e-6) {
    toast.error(
      `You can add at most ${formatMoney(room, currencyCode())} without exceeding the target.`,
    );
    return;
  }
  const date = contributionDate.value.trim() || new Date().toISOString().slice(0, 10);
  const desc = contributionDescription.value.trim();
  contributionSubmitting.value = true;
  try {
    await window.fundlog.transaction.createManual({
      profileId: pid,
      budgetId: b.id,
      subcategoryId: null,
      date,
      amount: contributionAmount.value,
      description: desc || `Savings: ${g.name}`,
      goalId: g.id,
    });
    await domain.loadTransactions();
    toast.success('Saved toward goal.');
    hideBsModal('recordGoalContributionModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not record savings.');
  } finally {
    contributionSubmitting.value = false;
  }
}
</script>

<template>
  <div class="view goals-view container-fluid">
    <h2 class="mb-2">Goals</h2>
    <p class="view-subtitle mb-3">
      Goals use the same idea as a calorie budget: monthly income is your allowance, planned lines and
      expenses on the active budget are what you have already “spent,” and what is left is how much
      room you have to push your goals forward this month.
    </p>

    <p v-if="!domain.activeProfileId" class="status-text mb-4">
      Create a profile in
      <RouterLink to="/settings">Settings</RouterLink>
      first. Goals belong to one profile at a time (the one marked active).
    </p>

    <template v-else>
      <section class="goals-explainer card border shadow-none mb-4">
        <div class="card-body py-3">
          <h3 class="h6 goals-explainer-title mb-2">How this ties to your budget</h3>
          <ul class="goals-explainer-list mb-0 small">
            <li>
              <strong>Income</strong> — your
              <RouterLink to="/budgets">active budget</RouterLink>
              base amount plus any
              <RouterLink to="/extra-income">Extra income</RouterLink>
              lines for <strong>this calendar month</strong>. Changing either updates the ring.
            </li>
            <li>
              <strong>Committed</strong> — planned subcategories, unexpected expenses from
              <RouterLink to="/expenses">Expenses</RouterLink>, and
              <strong>Record savings</strong> below (goal-linked amounts, counted like the rest of the
              plan). Adding any of these uses up headroom.
            </li>
            <li>
              <strong>Goals below</strong> — progress adds up amounts you record with
              <strong>Record savings</strong> on each goal (stored as transactions tied to that goal).
              The pace line compares your deadline to this month’s headroom so you see if the budget has
              room to hit the target.
            </li>
          </ul>
        </div>
      </section>

      <section
        v-if="activeBudget"
        class="card border shadow-none mb-4 goals-budget-fuel-card"
      >
        <div class="card-body py-3 py-md-4">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
            <div>
              <h3 class="h5 mb-1 goals-budget-fuel-title">This month’s income & commitments</h3>
              <p class="small text-muted mb-0">
                <strong>{{ activeBudget.name }}</strong>
                <span class="text-body-secondary"> · income vs. what your plan already commits</span>
              </p>
            </div>
            <div class="d-flex flex-wrap gap-2 flex-shrink-0">
              <RouterLink to="/extra-income" class="btn btn-sm btn-outline-secondary">
                Extra income
              </RouterLink>
              <RouterLink to="/budgets" class="btn btn-sm btn-outline-primary">
                Edit budget
              </RouterLink>
            </div>
          </div>

          <LoadingView v-if="loadingBudget" message="Loading budget…" />
          <template v-else>
            <div v-if="!monthlyIncome" class="small text-muted mb-0">
              Set a positive monthly income on this budget to see headroom and the ring.
            </div>
            <div v-else class="row g-4 align-items-center">
              <div class="col-auto mx-auto mx-md-0">
                <div
                  class="goals-fuel-ring"
                  :class="{ 'goals-fuel-ring--over': isOverCommitted }"
                  :style="{ '--goals-ring-pct': fuelRingUsedPct + '%' }"
                  role="img"
                  :aria-label="`Committed ${fuelRingUsedPct.toFixed(0)} percent of monthly income`"
                >
                  <div class="goals-fuel-ring__hole">
                    <span class="goals-fuel-ring__label">Left this month</span>
                    <span
                      class="goals-fuel-ring__value"
                      :class="{
                        'text-success': remainingHeadroom > 0,
                        'text-danger': remainingHeadroom < 0,
                        'text-body-secondary': remainingHeadroom === 0,
                      }"
                    >
                      {{ formatMoney(remainingHeadroom, currencyCode()) }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="col">
                <dl class="row goals-fuel-stats small mb-2 mb-md-3">
                  <div class="col-sm-4">
                    <dt class="text-muted fw-normal mb-0">Income (this month)</dt>
                    <dd class="mb-0 fw-semibold">
                      {{ formatMoney(monthlyIncome, currencyCode()) }}
                    </dd>
                  </div>
                  <div class="col-sm-4">
                    <dt class="text-muted fw-normal mb-0">Committed</dt>
                    <dd class="mb-0 fw-semibold">
                      {{ formatMoney(committedTotal, currencyCode()) }}
                    </dd>
                  </div>
                  <div class="col-sm-4">
                    <dt class="text-muted fw-normal mb-0">Headroom</dt>
                    <dd
                      class="mb-0 fw-semibold"
                      :class="{
                        'text-success': remainingHeadroom > 0,
                        'text-danger': remainingHeadroom < 0,
                      }"
                    >
                      {{ formatMoney(remainingHeadroom, currencyCode()) }}
                    </dd>
                  </div>
                </dl>
                <p v-if="monthIncomeBoost > 0" class="small text-muted mb-2">
                  Includes {{ formatMoney(monthIncomeBoost, currencyCode()) }} from
                  <RouterLink to="/extra-income">Extra income</RouterLink>
                  · base budget {{ formatMoney(baseMonthlyIncome, currencyCode()) }}
                </p>
                <p v-if="isOverCommitted" class="small text-danger mb-2">
                  You are committed above income this month. Goals have no positive headroom until you
                  trim the plan, raise income, or move spending.
                </p>
                <PlannedExpenseCategoryBar
                  :category-parts="plannedBarResult.categoryParts"
                  :unallocated-bar-pct="plannedBarResult.unallocatedBarPct"
                  empty-hint="Add planned lines on Budgets, log unexpected expenses, or record goal savings to see the split."
                  aria-label="Committed spending by category as a share of income"
                />
              </div>
            </div>
          </template>
        </div>
      </section>

      <p v-else class="status-text mb-4">
        Create a budget in
        <RouterLink to="/budgets">Budgets</RouterLink>
        to see monthly headroom next to your goals. You can still add goals below.
      </p>

      <section
        v-if="goals.length"
        class="card border shadow-none mb-4 goals-progress-chart-card"
      >
        <div class="card-body py-3">
          <h3 class="h6 mb-2 goals-progress-chart-title">Progress toward each goal</h3>
          <p class="small text-muted mb-2">
            Bar length matches the list below: <strong>recorded savings</strong> plus, when you link
            budget lines in <strong>Edit goal</strong>, up to this month’s planned amount from those
            lines toward whatever is still needed to hit the target. It is
            <strong>not</strong> the ring in <strong>This month’s income & commitments</strong>
            above—that ring is <em>income vs commitments</em> for the month.
          </p>
          <ul class="small text-muted mb-3 mb-md-2 ps-3">
            <li class="mb-1">
              <strong>Each row</strong> is one goal (priority order, same as the list).
            </li>
            <li class="mb-1">
              <strong>Bar length</strong> is 0–100% of the goal’s target. Hover a bar for recorded
              amounts and, when linked lines exist, how much of this month’s plan counts toward the gap.
            </li>
            <li class="mb-0">
              <strong>Record savings</strong> still moves the bar with real transactions. Linking
              budget lines only affects the displayed progress (this month’s plan slice), not your
              savings ledger.
            </li>
          </ul>
          <GoalsProgressBarChart
            :segments="goalChartSegments"
            :currency-code="currencyCode()"
          />
        </div>
      </section>

      <div class="row g-3">
        <div class="col-12">
          <section class="card card-list stacked-section h-100 goals-panel border shadow-none">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h3 class="h5 card-title mb-0">Your goals</h3>
                  <p class="small text-muted mb-0 goals-panel-sub">
                    Profile: <strong>{{ activeProfile?.name }}</strong>
                    · {{ activeProfile?.currencyCode }} amounts
                    ·
                    <span class="text-body-secondary">{{ dashboardEligibleCount }} on Dashboard</span>
                    (shows top 3 by priority). Use <strong>Edit goal</strong> to link budget lines so
                    this month’s planned amounts can count toward the progress bar (up to the amount
                    still needed).
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-bs-toggle="modal"
                  data-bs-target="#createGoalModal"
                  @click="openCreateGoalModal"
                >
                  Add goal
                </button>
              </div>

              <div v-if="!goals.length" class="goals-empty-hint">
                <p class="goals-empty-title">No goals yet</p>
                <p class="goals-empty-muted mb-3">
                  Add one for anything you’re working toward—emergency fund, payoff, trip, or major
                  purchase. Choose priority so the most important items surface on your Dashboard.
                </p>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  data-bs-toggle="modal"
                  data-bs-target="#createGoalModal"
                  @click="openCreateGoalModal"
                >
                  Add your first goal
                </button>
              </div>

              <ul
                v-else
                class="list-group list-group-flush rounded-3 border border-secondary-subtle goals-dashboard-list"
              >
                <li
                  v-for="{ goal: g, pace, planThisMonth, pctWithBudget } in goalRows"
                  :key="g.id"
                  class="list-group-item border-secondary-subtle px-3 px-md-4 py-4 bg-transparent"
                >
                  <div class="row g-3 align-items-start">
                    <div class="col-lg">
                      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <span class="fw-semibold fs-6 mb-0">{{ g.name }}</span>
                        <span
                          class="badge rounded-pill bg-transparent text-body-secondary border border-secondary-subtle fw-normal"
                        >
                          {{ priorityLabel(g.priority) }}
                        </span>
                      </div>
                      <div class="small text-muted mb-2">
                        Target
                        <strong class="text-body">{{
                          formatMoney(g.targetAmount, currencyCode())
                        }}</strong>
                        <template v-if="formatTargetDate(g.targetDate)">
                          · by {{ formatTargetDate(g.targetDate) }}
                        </template>
                      </div>
                      <div class="goals-goal-progress mt-2">
                        <div class="d-flex flex-wrap justify-content-between gap-1 small mb-1">
                          <span class="text-muted">Saved toward target</span>
                          <span class="text-body-secondary">
                            {{ formatMoney(pace.saved, currencyCode()) }}
                            ·
                            {{ pace.progressPct.toFixed(0) }}% recorded
                          </span>
                        </div>
                        <div class="progress goals-goal-progress__bar" style="height: 6px">
                          <div
                            class="progress-bar"
                            role="progressbar"
                            :style="{
                              width: Math.min(100, pctWithBudget) + '%',
                            }"
                            :aria-valuenow="Math.round(Math.min(100, pctWithBudget))"
                            aria-valuemin="0"
                            aria-valuemax="100"
                          />
                        </div>
                        <p class="small text-muted mb-0 mt-1">
                          {{ pctWithBudget.toFixed(0) }}% toward target
                          <template v-if="planThisMonth > 0 && pace.saved + 1e-9 < g.targetAmount">
                            (includes up to
                            {{ formatMoney(Math.min(planThisMonth, Math.max(0, g.targetAmount - pace.saved)), currencyCode()) }}
                            from this month’s linked budget lines)
                          </template>
                        </p>
                        <p
                          v-if="pace.neededPerMonth != null && pace.monthsLeft != null"
                          class="small mb-0 mt-2 goals-goal-pace"
                          :class="paceStatusClass(pace)"
                        >
                          To finish on time you need about
                          <strong>{{ formatMoney(pace.neededPerMonth, currencyCode()) }}</strong>
                          /mo over the next
                          {{ pace.monthsLeft }}
                          {{ pace.monthsLeft === 1 ? 'month' : 'months' }}. This month’s headroom is
                          <strong>{{ formatMoney(remainingHeadroom, currencyCode()) }}</strong>.
                          <template v-if="planThisMonth > 0 && pace.remainingToFund > 0">
                            Linked budget lines plan
                            <strong>{{ formatMoney(planThisMonth, currencyCode()) }}</strong>
                            /mo toward what is left after recorded savings.
                          </template>
                          <template v-if="pace.remainingToFund <= 0">
                            Target balance reached on paper—nice work.
                          </template>
                          <template
                            v-else-if="monthlyIncome > 0 && remainingHeadroom >= pace.neededPerMonth"
                          >
                            Your budget has enough slack to cover that pace if you send it here.
                          </template>
                          <template v-else-if="monthlyIncome > 0 && remainingHeadroom >= 0">
                            Headroom is below that pace—you may need to trim the plan or extend the
                            timeline.
                          </template>
                          <template v-else-if="monthlyIncome > 0">
                            No headroom while you are over-committed; loosen the budget to make
                            progress.
                          </template>
                        </p>
                        <p
                          v-else-if="pace.remainingToFund > 0"
                          class="small text-muted mb-0 mt-2 goals-goal-pace"
                        >
                          No target date on this goal, so monthly pace vs. headroom is not estimated.
                        </p>
                      </div>
                      <p v-if="g.note" class="small text-body-secondary mb-0 mt-2">{{ g.note }}</p>
                    </div>
                    <div class="col-lg-auto">
                      <div class="d-flex flex-column gap-3 align-items-stretch align-items-lg-end">
                        <button
                          type="button"
                          class="btn btn-outline-primary btn-sm align-self-stretch align-self-lg-end"
                          style="max-width: 15rem"
                          data-bs-toggle="modal"
                          data-bs-target="#recordGoalContributionModal"
                          :disabled="!activeBudget || isGoalTargetFullyFunded(g)"
                          :title="
                            !activeBudget
                              ? 'Select an active budget on the Budgets page first'
                              : isGoalTargetFullyFunded(g)
                                ? 'Target amount reached—edit the goal to raise the target if needed'
                                : 'Log money you put toward this goal'
                          "
                          @click="openRecordContributionModal(g)"
                        >
                          Record savings
                        </button>
                        <button
                          type="button"
                          class="btn btn-outline-secondary btn-sm align-self-stretch align-self-lg-end"
                          style="max-width: 15rem"
                          data-bs-toggle="modal"
                          data-bs-target="#editGoalModal"
                          @click="openEditGoalModal(g)"
                        >
                          Edit goal
                        </button>
                        <button
                          type="button"
                          class="btn btn-outline-danger btn-sm align-self-stretch align-self-lg-end"
                          style="max-width: 15rem"
                          data-bs-toggle="modal"
                          data-bs-target="#deleteGoalModal"
                          @click="openDeleteGoalModal(g)"
                        >
                          Delete goal
                        </button>
                        <div class="form-check form-switch mb-0">
                          <input
                            :id="'goal-dash-' + g.id"
                            class="form-check-input"
                            type="checkbox"
                            role="switch"
                            :checked="g.showOnDashboard"
                            @change="onGoalDashboardToggle(g, $event)"
                          />
                          <label class="form-check-label small" :for="'goal-dash-' + g.id">
                            Show on Dashboard
                          </label>
                        </div>
                        <div class="d-flex flex-column gap-1 w-100" style="max-width: 15rem">
                          <label class="form-label small mb-0 text-muted">Reprioritize</label>
                          <select
                            class="form-select form-select-sm"
                            :value="g.priority"
                            @change="onGoalPriorityChange(g, $event)"
                          >
                            <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                              {{ opt.label }}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>

  <div
    class="modal fade"
    id="createGoalModal"
    tabindex="-1"
    aria-labelledby="createGoalModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title" id="createGoalModalLabel">Add goal</h5>
            <p class="goals-modal-lead small text-muted mb-0">
              Saved to profile <strong>{{ activeProfile?.name ?? '…' }}</strong>
            </p>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submit">
          <div class="modal-body">
            <p class="goals-modal-intro small">
              Give this goal a clear name and target. Among goals with <strong>Show on Dashboard</strong>
              on, higher priority (5) fills a slot before lower priority; only three fit on the
              overview.
            </p>

            <div
              v-if="formError"
              class="rounded border border-danger border-opacity-25 px-3 py-2 small mb-3 text-danger"
              role="alert"
            >
              {{ formError }}
            </div>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label" for="goal-name">Goal name</label>
                <input
                  id="goal-name"
                  v-model="name"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Emergency fund, Pay off card, Vacation"
                  autocomplete="off"
                />
              </div>
              <div class="col-md-6">
                <label class="form-label" for="goal-amount">Target amount</label>
                <div class="input-group">
                  <span class="input-group-text">{{
                    activeProfile?.currencyCode?.trim() || 'USD'
                  }}</span>
                  <input
                    id="goal-amount"
                    v-model.number="targetAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    placeholder="5000"
                  />
                </div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="goal-date">Target date (optional)</label>
                <input id="goal-date" v-model="targetDate" type="date" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label" for="goal-priority">Priority</label>
                <select id="goal-priority" v-model.number="priority" class="form-select">
                  <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label" for="goal-note">Note (optional)</label>
                <textarea
                  id="goal-note"
                  v-model="note"
                  rows="3"
                  class="form-control"
                  placeholder="Why this matters, milestones, or reminders—only you see this."
                ></textarea>
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input
                    id="goal-show-dashboard"
                    v-model="showOnDashboardNew"
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                  />
                  <label class="form-check-label" for="goal-show-dashboard">
                    Show on Dashboard (competes for up to three spots by priority)
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-success">Save goal</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div
    class="modal fade"
    id="editGoalModal"
    tabindex="-1"
    aria-labelledby="editGoalModalLabel"
    aria-hidden="true"
    @hidden.bs.modal="onEditGoalModalHidden"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title" id="editGoalModalLabel">Edit goal</h5>
            <p class="goals-modal-lead small text-muted mb-0">
              Profile <strong>{{ activeProfile?.name ?? '…' }}</strong>
            </p>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submitEdit">
          <div class="modal-body">
            <p class="goals-modal-intro small">
              Update the target, deadline, or priority. Clear the date field to remove a deadline—pace
              hints then hide until you set a date again.
            </p>

            <div
              v-if="editFormError"
              class="rounded border border-danger border-opacity-25 px-3 py-2 small mb-3 text-danger"
              role="alert"
            >
              {{ editFormError }}
            </div>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label" for="edit-goal-name">Goal name</label>
                <input
                  id="edit-goal-name"
                  v-model="editName"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Emergency fund, Pay off card, Vacation"
                  autocomplete="off"
                />
              </div>
              <div class="col-md-6">
                <label class="form-label" for="edit-goal-amount">Target amount</label>
                <div class="input-group">
                  <span class="input-group-text">{{
                    activeProfile?.currencyCode?.trim() || 'USD'
                  }}</span>
                  <input
                    id="edit-goal-amount"
                    v-model.number="editTargetAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    placeholder="5000"
                  />
                </div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="edit-goal-date">Target date (optional)</label>
                <input id="edit-goal-date" v-model="editTargetDate" type="date" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label" for="edit-goal-priority">Priority</label>
                <select id="edit-goal-priority" v-model.number="editPriority" class="form-select">
                  <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label" for="edit-goal-note">Note (optional)</label>
                <textarea
                  id="edit-goal-note"
                  v-model="editNote"
                  rows="3"
                  class="form-control"
                  placeholder="Why this matters, milestones, or reminders—only you see this."
                ></textarea>
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input
                    id="edit-goal-show-dashboard"
                    v-model="editShowOnDashboard"
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                  />
                  <label class="form-check-label" for="edit-goal-show-dashboard">
                    Show on Dashboard (competes for up to three spots by priority)
                  </label>
                </div>
              </div>
              <div class="col-12">
                <label class="form-label mb-1">Budget lines for this goal (this month)</label>
                <p class="small text-muted mb-2">
                  Checked lines add their <strong>planned monthly amount</strong> from your active
                  budget to the progress bar, up to what is still needed after recorded savings.
                </p>
                <div
                  v-if="!subsByParentForEdit.length"
                  class="small text-muted border rounded px-2 py-2 mb-0"
                >
                  No planned lines in this budget yet. Add subcategories and amounts on
                  <RouterLink to="/budgets">Budgets</RouterLink>.
                </div>
                <div
                  v-else
                  class="border rounded px-2 py-2 goals-edit-budget-links"
                  style="max-height: 14rem; overflow-y: auto"
                >
                  <div
                    v-for="{ category, subs } in subsByParentForEdit"
                    :key="category.id"
                    class="mb-2"
                  >
                    <div class="small fw-semibold text-body-secondary mb-1">{{ category.label }}</div>
                    <div v-for="sub in subs" :key="sub.id" class="form-check ms-1 mb-1">
                      <input
                        :id="'edit-goal-link-sub-' + sub.id"
                        class="form-check-input"
                        type="checkbox"
                        :checked="editLinkedSubcategoryIds.includes(sub.id)"
                        @change="
                          toggleEditLinkedSub(
                            sub.id,
                            ($event.target as HTMLInputElement).checked,
                          )
                        "
                      />
                      <label class="form-check-label small" :for="'edit-goal-link-sub-' + sub.id">
                        {{ sub.label }}
                        <span class="text-muted">({{ plannedLineMonthlyAmount(sub) }}/mo)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save changes</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div
    class="modal fade"
    id="deleteGoalModal"
    tabindex="-1"
    aria-labelledby="deleteGoalModalLabel"
    aria-hidden="true"
    @hidden.bs.modal="onDeleteGoalModalHidden"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-danger border-opacity-25">
          <h5 class="modal-title text-danger" id="deleteGoalModalLabel">Delete goal</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p class="mb-2">
            Delete
            <strong v-if="goalToDelete">{{ goalToDelete.name }}</strong>
            <span v-else>this goal</span>
            ? This cannot be undone.
          </p>
          <p class="small text-muted mb-0">
            Savings transactions that pointed at this goal will stay on your
            <RouterLink to="/transactions">Transactions</RouterLink>
            list; they are simply no longer linked to a goal.
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="deleteSubmitting || !goalToDelete"
            @click="confirmDeleteGoal"
          >
            Delete goal
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    class="modal fade"
    id="recordGoalContributionModal"
    tabindex="-1"
    aria-labelledby="recordGoalContributionModalLabel"
    aria-hidden="true"
    @hidden.bs.modal="onContributionModalHidden"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title" id="recordGoalContributionModalLabel">Record savings</h5>
            <p v-if="contributionGoal" class="small text-muted mb-0">
              Toward <strong>{{ contributionGoal.name }}</strong>
              <template v-if="activeBudget">
                · budget <strong>{{ activeBudget.name }}</strong>
              </template>
            </p>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submitRecordContribution">
          <div class="modal-body">
            <p v-if="!activeBudget" class="small text-danger mb-3 mb-md-2">
              Choose an active budget on the
              <RouterLink to="/budgets">Budgets</RouterLink>
              page before recording savings.
            </p>
            <div v-else class="row g-3">
              <p v-if="contributionGoal" class="col-12 small text-muted mb-0">
                <template v-if="contributionRemaining > 0">
                  Up to
                  <strong>{{ formatMoney(contributionRemaining, currencyCode()) }}</strong>
                  left before you hit this goal's target.
                </template>
                <template v-else> This goal's target is already met. </template>
              </p>
              <div class="col-12">
                <label class="form-label" for="contribution-amount">Amount</label>
                <div class="input-group">
                  <span class="input-group-text">{{
                    activeProfile?.currencyCode?.trim() || 'USD'
                  }}</span>
                  <input
                    id="contribution-amount"
                    v-model.number="contributionAmount"
                    type="number"
                    min="0"
                    :max="contributionRemaining > 0 ? contributionRemaining : undefined"
                    step="0.01"
                    class="form-control"
                    placeholder="e.g. 100"
                    required
                  />
                </div>
              </div>
              <div class="col-12">
                <label class="form-label" for="contribution-date">Date</label>
                <input id="contribution-date" v-model="contributionDate" type="date" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label" for="contribution-note">Note (optional)</label>
                <input
                  id="contribution-note"
                  v-model="contributionDescription"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Transfer to savings account"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="
                !activeBudget || contributionSubmitting || contributionRemaining <= 0
              "
            >
              Save to goal
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
