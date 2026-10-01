<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import { calendarMonthNow } from '../shared/calendarMonth';
import { formatMoney as formatMoneyExact } from '../shared/formatMoney';
import type { BudgetMonthIncomeBoost } from '../shared/types';

defineProps<{ modalId: string }>();

const domain = useDomainStore();

const selectedMonth = ref(calendarMonthNow());
const amount = ref<number | null>(null);
const label = ref('');
const formError = ref<string | null>(null);
const submitting = ref(false);

const activeBudget = computed(() => domain.activeBudget);
const currencyCode = computed(() => domain.activeProfile?.currencyCode?.trim() || 'USD');

const rowsForMonth = computed(() =>
  domain.budgetIncomeBoosts.filter(
    (r) => r.budgetId === activeBudget.value?.id && r.month === selectedMonth.value.trim(),
  ),
);

const baseIncome = computed(() => activeBudget.value?.monthlyIncome ?? 0);

const boostTotal = computed(() =>
  domain.incomeBoostSumForBudgetMonth(activeBudget.value?.id ?? 0, selectedMonth.value.trim()),
);

const effectiveIncome = computed(() => {
  const id = activeBudget.value?.id;
  if (id == null) return 0;
  return domain.effectiveMonthlyIncomeFor(id, selectedMonth.value.trim());
});

function formatMoney(n: number) {
  return formatMoneyExact(n, currencyCode.value);
}

function formatMonthLabel(ym: string) {
  const d = new Date(`${ym}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

onMounted(async () => {
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
  <div
    :id="modalId"
    class="modal fade"
    tabindex="-1"
    :aria-labelledby="`${modalId}Label`"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 :id="`${modalId}Label`" class="modal-title">Extra income</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body">
          <p class="small text-muted mb-3">
            Add money for a specific month when you earn more than usual, like extra shifts,
            bonuses, or side work. Your base monthly income stays the same; every page uses the
            month’s effective total.
          </p>

          <p v-if="!activeBudget" class="status-text mb-0">
            Select or create an active budget first. Extra income is stored per budget.
          </p>

          <template v-else>
            <div class="row g-2 align-items-end mb-3">
              <div class="col-12 col-sm-5">
                <label class="form-label small mb-1" for="extra-income-month">Month</label>
                <input
                  id="extra-income-month"
                  v-model="selectedMonth"
                  type="month"
                  class="form-control form-control-sm"
                />
              </div>
              <div class="col-12 col-sm-7">
                <div class="budget-stat-grid">
                  <div class="budget-stat">
                    <div class="budget-stat__label">Base</div>
                    <div class="budget-stat__value">{{ formatMoney(baseIncome) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Extra</div>
                    <div class="budget-stat__value">{{ formatMoney(boostTotal) }}</div>
                  </div>
                  <div class="budget-stat">
                    <div class="budget-stat__label">Effective</div>
                    <div class="budget-stat__value">{{ formatMoney(effectiveIncome) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <form class="row g-2 align-items-end mb-3" @submit.prevent="submit">
              <div class="col-12 col-sm-4">
                <label class="form-label small mb-1" for="extra-income-amount">Amount</label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text">{{ currencyCode }}</span>
                  <input
                    id="extra-income-amount"
                    v-model.number="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    :class="{ 'is-invalid': formError }"
                    placeholder="e.g. 250"
                  />
                </div>
              </div>
              <div class="col-12 col-sm-5">
                <label class="form-label small mb-1" for="extra-income-label">Label (optional)</label>
                <input
                  id="extra-income-label"
                  v-model="label"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="e.g. Extra Saturday shift"
                  autocomplete="off"
                />
              </div>
              <div class="col-12 col-sm-3">
                <button type="submit" class="btn btn-sm btn-primary w-100" :disabled="submitting">
                  Add
                </button>
              </div>
              <div v-if="formError" class="col-12">
                <div class="small text-danger" role="alert">{{ formError }}</div>
              </div>
            </form>

            <h6 class="mb-2">Entries for {{ formatMonthLabel(selectedMonth) }}</h6>
            <p v-if="!rowsForMonth.length" class="small text-muted mb-0">
              No extra income for this month yet.
            </p>
            <ul v-else class="list-group list-group-flush rounded-3 border extra-income-list">
              <li
                v-for="r in rowsForMonth"
                :key="r.id"
                class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-2 bg-transparent"
              >
                <div>
                  <div class="fw-medium">{{ formatMoney(r.amount) }}</div>
                  <div class="small text-muted">{{ r.label || 'No label' }}</div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger" @click="removeRow(r)">
                  Remove
                </button>
              </li>
            </ul>
          </template>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>
