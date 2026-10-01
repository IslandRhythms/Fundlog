<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import BudgetMonthlyHistory from '../components/BudgetMonthlyHistory.vue';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import type { Budget } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();
const router = useRouter();
const route = useRoute();

type Row = Budget & { totalSpent: number; txCount: number };
type RecordsTab = 'budgets' | 'history';

const rows = ref<Row[]>([]);
const loading = ref(false);

const activeTab = computed<RecordsTab>(() =>
  route.query.tab === 'history' ? 'history' : 'budgets',
);

function selectTab(tab: RecordsTab) {
  router.replace({ query: { ...route.query, tab: tab === 'history' ? 'history' : undefined } });
}

const name = ref('');
const startMonth = ref('');
const monthlyIncome = ref<number | null>(null);
const ruleSet = ref<'fiftyThirtyTwenty' | 'custom'>('fiftyThirtyTwenty');

const clearActivityMonth = ref('');
const clearingMonth = ref(false);

const sortedBudgets = computed(() =>
  [...domain.budgets].sort((a, b) => b.startMonth.localeCompare(a.startMonth)),
);

const activeBudget = computed(() => domain.activeBudget);

function openClearMonthModal() {
  const d = new Date();
  clearActivityMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function load() {
  if (!domain.activeProfileId) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const enriched: Row[] = [];
    for (const b of sortedBudgets.value) {
      const s = await window.fundlog.transaction.spendSummaryForBudget(b.id);
      enriched.push({
        ...b,
        totalSpent: s.totalAmount,
        txCount: s.count,
      });
    }
    rows.value = enriched;
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!name.value || !startMonth.value || !monthlyIncome.value) return;
  const ok = await domain.createBudget({
    name: name.value.trim(),
    startMonth: startMonth.value,
    monthlyIncome: monthlyIncome.value,
    ruleSet: ruleSet.value,
  });
  if (!ok) return;
  name.value = '';
  startMonth.value = '';
  monthlyIncome.value = null;
  ruleSet.value = 'fiftyThirtyTwenty';
  await load();
  hideBsModal('createBudgetModal');
  router.push('/budgets');
}

async function confirmClearMonthActivity() {
  if (!activeBudget.value) return;
  clearingMonth.value = true;
  try {
    const { deleted } = await window.fundlog.transaction.clearForBudgetMonth(
      activeBudget.value.id,
      clearActivityMonth.value,
    );
    await load();
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

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
  await load();
});

function vsIncome(b: Row): string {
  if (!b.monthlyIncome || !b.totalSpent) return '—';
  const pct = (b.totalSpent / b.monthlyIncome) * 100;
  return `${pct.toFixed(1)}% of one month’s income`;
}
</script>

<template>
  <div class="view budget-records-view container-fluid">
    <p class="view-page-eyebrow mb-1">Archive</p>
    <h2 class="mb-2">Budget Records</h2>
    <p class="view-subtitle mb-3">
      Create and review budgets, lifetime totals, and monthly history. Use
      <RouterLink to="/budgets">Budgets</RouterLink> for day-to-day planning.
    </p>

    <ul v-if="domain.activeProfileId" class="nav nav-tabs mb-3" role="tablist">
      <li class="nav-item" role="presentation">
        <button
          type="button"
          class="nav-link"
          :class="{ active: activeTab === 'budgets' }"
          role="tab"
          :aria-selected="activeTab === 'budgets'"
          @click="selectTab('budgets')"
        >
          Budgets
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button
          type="button"
          class="nav-link"
          :class="{ active: activeTab === 'history' }"
          role="tab"
          :aria-selected="activeTab === 'history'"
          @click="selectTab('history')"
        >
          Monthly history
        </button>
      </li>
    </ul>

    <p v-if="!domain.activeProfileId" class="status-text">
      Create a profile in Settings first.
    </p>

    <BudgetMonthlyHistory v-else-if="activeTab === 'history'" />

    <template v-else>
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
        <RouterLink
          v-if="activeBudget"
          to="/budgets?extraIncome=1"
          class="btn btn-outline-secondary"
        >
          Extra income
        </RouterLink>
      </div>

      <div v-if="loading" class="budget-records-loading">
        <LoadingView message="Loading budget totals…" />
      </div>
      <div v-else-if="!rows.length" class="budget-records-empty-hint">
        <p class="budget-records-empty-title">No budgets yet</p>
        <p class="budget-records-empty-muted mb-0">
          Use <strong>New budget</strong> above to create one, then plan line items on
          <strong>Budgets</strong>.
        </p>
      </div>
      <div v-else class="budget-records-panel">
        <div class="table-responsive budget-records-table-scroll">
          <table class="table budget-records-table align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Budget</th>
                <th scope="col">Period</th>
                <th scope="col" class="text-end">Monthly income</th>
                <th scope="col" class="text-end">Total logged</th>
                <th scope="col" class="text-end">Txns</th>
                <th scope="col">Rule</th>
                <th scope="col">Vs income</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in rows" :key="b.id">
                <td>
                  <div class="budget-records-name">
                    <span class="budget-records-name-text">{{ b.name }}</span>
                    <span v-if="b.isActive" class="badge bg-success budget-records-active-badge">
                      Active
                    </span>
                  </div>
                </td>
                <td>
                  <div class="budget-records-period">
                    <span class="budget-records-period-start">{{ b.startMonth }}</span>
                    <span class="budget-records-period-sep">→</span>
                    <span class="budget-records-subtle">{{ b.endMonth || 'Open' }}</span>
                  </div>
                </td>
                <td class="budget-records-num">{{ b.monthlyIncome.toLocaleString() }}</td>
                <td class="budget-records-num budget-records-num--spent">
                  {{ b.totalSpent.toLocaleString() }}
                </td>
                <td class="budget-records-num budget-records-subtle">{{ b.txCount }}</td>
                <td>
                  <span
                    v-if="b.ruleSet === 'fiftyThirtyTwenty'"
                    class="budget-records-pill budget-records-pill--rule"
                  >
                    50 / 30 / 20
                  </span>
                  <span v-else class="budget-records-pill budget-records-pill--custom">Custom</span>
                </td>
                <td class="budget-records-vs budget-records-subtle">{{ vsIncome(b) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-if="rows.length && !loading" class="small mt-3 mb-0 budget-records-caption">
        Total logged is the sum of every transaction for that budget (all dates). Use
        <strong>Start clean month</strong> above to wipe one month’s activity without rebuilding
        the budget. See <strong>Monthly history</strong> for per-month performance.
      </p>
    </template>
  </div>

  <div
    id="clearMonthModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="clearMonthModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
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
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createBudgetModalLabel">Create budget</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
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
            <button class="btn btn-success" type="submit">Save budget</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
