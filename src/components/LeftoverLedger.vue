<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { FUND_COLORS } from '../shared/fundColors';
import type { LedgerKind, LedgerRow } from '../shared/leftoverLedger';

const props = defineProps<{
  rows: LedgerRow[];
  income: number;
  currencyCode: string;
}>();

const COLLAPSED_COUNT = 8;

const KINDS: LedgerKind[] = ['planned', 'goal', 'purchase', 'unexpected'];

const KIND_LABELS: Record<LedgerKind, string> = {
  planned: 'Planned',
  purchase: 'Purchase',
  unexpected: 'Unexpected',
  goal: 'Goal savings',
};

const KIND_TOTAL_LABELS: Record<LedgerKind, string> = {
  planned: 'Planned',
  purchase: 'Purchases',
  unexpected: 'Unexpected',
  goal: 'Goal savings',
};

const KIND_COLORS: Record<LedgerKind, string> = {
  planned: FUND_COLORS.needs,
  purchase: FUND_COLORS.purchase,
  unexpected: FUND_COLORS.unexpected,
  goal: FUND_COLORS.goalSavings,
};

const filter = ref<LedgerKind | 'all'>('all');
const showAll = ref(false);

const totals = computed(() => {
  const byKind: Record<LedgerKind, number> = { planned: 0, purchase: 0, unexpected: 0, goal: 0 };
  const counts: Record<LedgerKind, number> = { planned: 0, purchase: 0, unexpected: 0, goal: 0 };
  for (const r of props.rows) {
    byKind[r.kind] += r.amount;
    counts[r.kind] += 1;
  }
  return { byKind, counts };
});

const committed = computed(() => props.rows.reduce((sum, r) => sum + r.amount, 0));
const left = computed(() => props.income - committed.value);
const isOver = computed(() => left.value < -0.005);

/** Stacked bar scale: income, or committed when it exceeds income so overspend still fits. */
const barScale = computed(() => Math.max(props.income, committed.value) || 1);

type BarSegment = { key: string; label: string; color: string; amount: number };

const barSegments = computed(() => {
  const segments: BarSegment[] = KINDS.filter((k) => totals.value.byKind[k] > 0).map((k) => ({
    key: k,
    label: KIND_TOTAL_LABELS[k],
    color: KIND_COLORS[k],
    amount: totals.value.byKind[k],
  }));
  if (left.value > 0.005) {
    segments.push({
      key: 'left',
      label: 'Left',
      color: FUND_COLORS.unassigned,
      amount: left.value,
    });
  }
  return segments.map((s) => ({ ...s, pct: (s.amount / barScale.value) * 100 }));
});

const filters = computed(() =>
  KINDS.filter((k) => totals.value.counts[k] > 0).map((k) => ({
    key: k,
    label: KIND_TOTAL_LABELS[k],
    count: totals.value.counts[k],
  })),
);

const filteredRows = computed(() =>
  filter.value === 'all' ? props.rows : props.rows.filter((r) => r.kind === filter.value),
);

const visibleRows = computed(() =>
  showAll.value ? filteredRows.value : filteredRows.value.slice(0, COLLAPSED_COUNT),
);

function formatMoney(amount: number) {
  return formatMoneyExact(amount, props.currencyCode);
}

function pctOfIncome(amount: number): string {
  if (props.income <= 0) return '—';
  return `${formatPercent((amount / props.income) * 100)}%`;
}

function setFilter(next: LedgerKind | 'all') {
  filter.value = next;
  showAll.value = false;
}
</script>

<template>
  <div class="leftover-ledger">
    <div class="leftover-ledger__summary">
      <div class="leftover-ledger__hero">
        <span class="leftover-ledger__hero-label d-inline-flex align-items-center gap-2">
          <span
            class="budgets-table__swatch rounded-circle"
            :style="{ backgroundColor: isOver ? FUND_COLORS.over : FUND_COLORS.unassigned }"
            aria-hidden="true"
          />
          {{ isOver ? 'Over by' : 'Left this month' }}
        </span>
        <span
          class="leftover-ledger__hero-value"
          :class="isOver ? 'text-danger' : 'leftover-ledger__hero-value--left'"
        >
          {{ formatMoney(Math.abs(left)) }}
        </span>
        <span class="leftover-ledger__hero-meta">
          of {{ formatMoney(income) }} income ·
          {{ formatMoney(committed) }} committed
        </span>
      </div>

      <dl class="leftover-ledger__stats row row-cols-2 row-cols-md-4 g-2 mb-0">
        <div v-for="k in KINDS" :key="k" class="col">
          <div class="leftover-ledger__stat" :style="{ '--kind-color': KIND_COLORS[k] }">
            <dt>{{ KIND_TOTAL_LABELS[k] }}</dt>
            <dd class="mb-0">{{ formatMoney(totals.byKind[k]) }}</dd>
          </div>
        </div>
      </dl>
    </div>

    <div
      class="progress-stacked leftover-ledger__bar"
      role="img"
      :aria-label="`Income use: ${barSegments.map((s) => `${s.label} ${formatMoney(s.amount)}`).join(', ')}`"
    >
      <div
        v-for="seg in barSegments"
        :key="seg.key"
        class="progress"
        :style="{ width: seg.pct + '%' }"
        :title="`${seg.label}: ${formatMoney(seg.amount)}`"
      >
        <div class="progress-bar" :style="{ backgroundColor: seg.color }" />
      </div>
    </div>
    <p v-if="isOver" class="leftover-ledger__over small text-danger mb-0">
      Committed is {{ formatMoney(Math.abs(left)) }} more than this month's income.
    </p>

    <p v-if="!rows.length" class="leftover-ledger__empty small mb-0">
      Nothing is drawing down this month yet.
    </p>

    <template v-else>
      <div class="leftover-ledger__toolbar">
        <h4 class="leftover-ledger__heading">Entries</h4>
        <div class="nav nav-pills leftover-ledger__filters" role="group" aria-label="Filter by type">
          <button
            type="button"
            class="nav-link"
            :class="{ active: filter === 'all' }"
            @click="setFilter('all')"
          >
            All <span class="leftover-ledger__count">{{ rows.length }}</span>
          </button>
          <button
            v-for="f in filters"
            :key="f.key"
            type="button"
            class="nav-link"
            :class="{ active: filter === f.key }"
            @click="setFilter(f.key)"
          >
            {{ f.label }} <span class="leftover-ledger__count">{{ f.count }}</span>
          </button>
        </div>
      </div>

      <div class="budgets-table-wrap">
        <table class="table align-middle budgets-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Type</th>
              <th scope="col">Category</th>
              <th scope="col" class="budgets-table__num">% income</th>
              <th scope="col" class="budgets-table__num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.key">
              <td>{{ row.label }}</td>
              <td class="text-nowrap">
                <span class="d-inline-flex align-items-center gap-2">
                  <span
                    class="budgets-table__swatch rounded-circle"
                    :style="{ backgroundColor: KIND_COLORS[row.kind] }"
                    aria-hidden="true"
                  />
                  {{ KIND_LABELS[row.kind] }}
                </span>
              </td>
              <td>
                <span v-if="row.categoryLabel" class="d-inline-flex align-items-center gap-2">
                  <span
                    class="budgets-table__swatch rounded-circle"
                    :style="{ backgroundColor: row.color }"
                    aria-hidden="true"
                  />
                  {{ row.categoryLabel }}
                </span>
                <span v-else class="budgets-table__zero">—</span>
              </td>
              <td class="budgets-table__num budgets-table__zero">{{ pctOfIncome(row.amount) }}</td>
              <td class="budgets-table__num fw-semibold">{{ formatMoney(row.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        v-if="filteredRows.length > COLLAPSED_COUNT"
        type="button"
        class="btn btn-sm btn-link px-0 mt-2"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show fewer' : `Show all ${filteredRows.length}` }}
      </button>
    </template>
  </div>
</template>
