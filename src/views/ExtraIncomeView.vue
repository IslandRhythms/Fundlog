<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useDomainStore } from '../stores/domain';
import { calendarMonthNow } from '../shared/calendarMonth';
import type { BudgetMonthIncomeBoost, Profile } from '../shared/types';

const domain = useDomainStore();

const selectedMonth = ref(calendarMonthNow());
const amount = ref<number | null>(null);
const label = ref('');
const formError = ref<string | null>(null);
const submitting = ref(false);

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const activeBudget = computed(() => domain.activeBudget);

const rowsForMonth = computed(() =>
  domain.budgetIncomeBoosts.filter(
    (r) =>
      r.budgetId === activeBudget.value?.id && r.month === selectedMonth.value.trim(),
  ),
);

const baseIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const boostTotal = computed(() =>
  domain.incomeBoostSumForBudgetMonth(
    activeBudget.value?.id ?? 0,
    selectedMonth.value.trim(),
  ),
);

const effectiveIncome = computed(() => {
  const id = activeBudget.value?.id;
  if (id == null) return 0;
  return domain.effectiveMonthlyIncomeFor(id, selectedMonth.value.trim());
});

function formatMoney(n: number) {
  const code = activeProfile.value?.currencyCode?.trim() || 'USD';
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency: code });
  } catch {
    return `${n.toLocaleString()} ${code}`;
  }
}

function formatMonthLabel(ym: string) {
  const d = new Date(`${ym}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await domain.loadBudgetIncomeBoosts();
});

async function submit() {
  formError.value = null;
  if (!activeBudget.value) return;
  if (amount.value == null || amount.value <= 0 || !Number.isFinite(amount.value)) {
    formError.value = 'Enter a positive amount.';
    return;
  }
  submitting.value = true;
  try {
    const ok = await domain.createIncomeBoost({
      budgetId: activeBudget.value.id,
      month: selectedMonth.value.trim(),
      amount: amount.value,
      label: label.value.trim() || null,
    });
    if (!ok) return;
    amount.value = null;
    label.value = '';
  } finally {
    submitting.value = false;
  }
}

async function removeRow(r: BudgetMonthIncomeBoost) {
  await domain.deleteIncomeBoost(r.id);
}
</script>

<template>
  <div class="view extra-income-view container-fluid">
    <h2 class="mb-2">Extra income</h2>
    <p class="view-subtitle mb-4">
      Add money for a specific calendar month when you earn more than usual—extra shifts, bonuses,
      side work. Your
      <RouterLink to="/budgets">base monthly income</RouterLink>
      stays the same; this page layers temporary bumps. The
      <RouterLink to="/dashboard">Dashboard</RouterLink>,
      <RouterLink to="/goals">Goals</RouterLink>
      fuel ring,
      <RouterLink to="/budgets">Budgets</RouterLink>
      percentages, and
      <RouterLink to="/expenses">Expenses</RouterLink>
      use <strong>this month’s</strong> effective total (base + extras below).
    </p>

    <p v-if="!domain.activeProfileId" class="status-text mb-4">
      Create a profile in
      <RouterLink to="/settings">Settings</RouterLink>
      first.
    </p>

    <template v-else-if="!activeBudget">
      <p class="status-text mb-0">
        Select or create an active budget on the
        <RouterLink to="/budgets">Budgets</RouterLink>
        page. Extra income is stored per budget.
      </p>
    </template>

    <template v-else>
      <section class="card border shadow-none mb-4">
        <div class="card-body py-3">
          <h3 class="h6 mb-2">Effective income</h3>
          <p class="small text-muted mb-2">
            Budget <strong>{{ activeBudget.name }}</strong>
            · month <strong>{{ formatMonthLabel(selectedMonth) }}</strong>
          </p>
          <dl class="row small mb-0 extra-income-dl">
            <dt class="col-sm-4 text-muted">Base (from Budgets)</dt>
            <dd class="col-sm-8">{{ formatMoney(baseIncome) }}</dd>
            <dt class="col-sm-4 text-muted">Extra this month</dt>
            <dd class="col-sm-8">
              {{ formatMoney(boostTotal) }}
              <span v-if="!rowsForMonth.length" class="text-muted">— none recorded</span>
            </dd>
            <dt class="col-sm-4 text-muted fw-semibold text-body">Effective total</dt>
            <dd class="col-sm-8 fw-semibold">{{ formatMoney(effectiveIncome) }}</dd>
          </dl>
        </div>
      </section>

      <div class="row g-3">
        <div class="col-lg-5">
          <section class="card border shadow-none h-100">
            <div class="card-body">
              <h3 class="h6 mb-3">Add extra for a month</h3>
              <div class="mb-3">
                <label class="form-label" for="extra-income-month">Calendar month</label>
                <input
                  id="extra-income-month"
                  v-model="selectedMonth"
                  type="month"
                  class="form-control"
                />
              </div>
              <form @submit.prevent="submit">
                <div
                  v-if="formError"
                  class="rounded border border-danger border-opacity-25 px-3 py-2 small mb-3 text-danger"
                  role="alert"
                >
                  {{ formError }}
                </div>
                <div class="mb-3">
                  <label class="form-label" for="extra-income-amount">Amount</label>
                  <div class="input-group">
                    <span class="input-group-text">{{
                      activeProfile?.currencyCode?.trim() || 'USD'
                    }}</span>
                    <input
                      id="extra-income-amount"
                      v-model.number="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      class="form-control"
                      placeholder="e.g. 250"
                    />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label" for="extra-income-label">Label (optional)</label>
                  <input
                    id="extra-income-label"
                    v-model="label"
                    type="text"
                    class="form-control"
                    placeholder="e.g. Extra Saturday shift"
                    autocomplete="off"
                  />
                </div>
                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="submitting"
                >
                  Add to this month
                </button>
              </form>
            </div>
          </section>
        </div>
        <div class="col-lg-7">
          <section class="card border shadow-none h-100">
            <div class="card-body">
              <h3 class="h6 mb-2">Entries for {{ formatMonthLabel(selectedMonth) }}</h3>
              <p class="small text-muted mb-3">
                Change the month above to review or add bumps for other months.
              </p>
              <p v-if="!rowsForMonth.length" class="small text-muted mb-0">
                No extra income lines for this budget and month yet.
              </p>
              <ul v-else class="list-group list-group-flush rounded-3 border extra-income-list">
                <li
                  v-for="r in rowsForMonth"
                  :key="r.id"
                  class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-3 bg-transparent"
                >
                  <div>
                    <div class="fw-medium">{{ formatMoney(r.amount) }}</div>
                    <div class="small text-muted">
                      {{ r.label || 'No label' }}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    @click="removeRow(r)"
                  >
                    Remove
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
