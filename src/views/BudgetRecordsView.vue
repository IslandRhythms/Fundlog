<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import type { Budget } from '../shared/types';

const domain = useDomainStore();

type Row = Budget & { totalSpent: number; txCount: number };

const rows = ref<Row[]>([]);
const loading = ref(false);

const sortedBudgets = computed(() =>
  [...domain.budgets].sort((a, b) => b.startMonth.localeCompare(a.startMonth)),
);

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
    <h2 class="mb-2">Budget Records</h2>
    <p class="view-subtitle mb-4">
      Every budget you’ve set up, with lifetime totals logged against it. Compare activity
      across budgets or see how much you’ve recorded in total.
    </p>

    <p v-if="!domain.activeProfileId" class="status-text">
      Create a profile in Settings first.
    </p>

    <template v-else>
      <div v-if="loading" class="budget-records-loading">
        <LoadingView message="Loading budget totals…" />
      </div>
      <div v-else-if="!rows.length" class="budget-records-empty-hint">
        <p class="budget-records-empty-title">No budgets yet</p>
        <p class="budget-records-empty-muted mb-0">
          Create a budget on the <strong>Budgets</strong> page to see lifetime totals and activity
          here.
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
        Total logged is the sum of every transaction for that budget (all dates). It is not limited
        to one month unless you use <strong>Start clean month</strong> on the Budgets page.
      </p>
    </template>
  </div>
</template>
