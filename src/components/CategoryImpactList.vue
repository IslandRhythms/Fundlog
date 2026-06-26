<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CategoryImpact, ImpactTxn } from '../shared/categoryImpact';
import { formatMoney as formatMoneyExact } from '../shared/formatMoney';

const props = defineProps<{
  rows: CategoryImpact[];
  currencyCode: string;
  /** Uncommitted leftover this month: income − planned − goal savings. */
  pool: number;
  emptyHint?: string;
}>();

function fmt(n: number) {
  return formatMoneyExact(n, props.currencyCode);
}

const expanded = ref<Record<number, boolean>>({});

function toggle(id: number) {
  expanded.value[id] = !expanded.value[id];
}

function txDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function txKindLabel(item: ImpactTxn): string {
  return item.kind === 'purchase' ? 'Purchase' : 'Unexpected';
}

/** Only categories that actually spent against the leftover. */
const spentRows = computed(() => props.rows.filter((r) => r.extra > 0));

const totalExtra = computed(() => spentRows.value.reduce((sum, r) => sum + r.extra, 0));

const moneyLeft = computed(() => props.pool - totalExtra.value);

/** Bar scale: the larger of the leftover and what was spent, so over-spend still fits. */
const denom = computed(() => Math.max(props.pool, totalExtra.value) || 1);

/** Bar width as a share of the leftover track. */
function widthPct(value: number) {
  return (value / denom.value) * 100;
}

/** Share of the uncommitted leftover this category consumed (null when there is none). */
function leftoverPct(value: number): number | null {
  if (props.pool <= 0) return null;
  return Math.min(100, (value / props.pool) * 100);
}

const isOver = computed(() => moneyLeft.value < -0.005);
</script>

<template>
  <div v-if="spentRows.length">
    <p class="category-impact-summary small mb-2">
      Purchases &amp; unexpected used
      <strong>{{ fmt(totalExtra) }}</strong>
      of your
      <strong>{{ fmt(Math.max(pool, 0)) }}</strong>
      uncommitted leftover —
      <strong :class="isOver ? 'category-impact-summary__over' : 'category-impact-summary__left'">
        <template v-if="isOver">{{ fmt(Math.abs(moneyLeft)) }} over</template>
        <template v-else>{{ fmt(moneyLeft) }} left</template>
      </strong>.
    </p>

    <div
      class="pool-bar"
      :class="{ 'pool-bar--over': isOver }"
      role="img"
      aria-label="Leftover consumed by purchases and unexpected expenses"
    >
      <span
        v-for="row in spentRows"
        :key="'pool-' + row.id"
        class="pool-bar__seg"
        :style="{ width: widthPct(row.extra) + '%', background: row.color }"
        :title="`${row.label}: ${fmt(row.extra)}`"
      />
    </div>
    <div class="pool-bar__legend small mb-3">
      <span class="pool-bar__legend-item">
        <span class="pool-bar__legend-swatch pool-bar__legend-swatch--left" />
        {{ isOver ? 'No leftover (over)' : 'Money left (unfilled)' }}
      </span>
      <span class="pool-bar__legend-item">
        <span class="budget-impact-legend__swatch budget-impact-legend__swatch--purchase" />
        Purchases
      </span>
      <span class="pool-bar__legend-item">
        <span class="budget-impact-legend__swatch budget-impact-legend__swatch--unexpected" />
        Unexpected
      </span>
    </div>

    <ul class="budget-impact-list list-unstyled mb-0">
      <li v-for="row in spentRows" :key="row.id" class="budget-impact-item">
        <div class="budget-impact-item__head">
          <span class="budget-impact-item__name">
            <span
              class="budget-impact-item__swatch"
              :style="{ background: row.color }"
              aria-hidden="true"
            />
            {{ row.label }}
          </span>
          <span class="budget-impact-item__values">
            <strong>{{ fmt(row.extra) }}</strong>
            <span v-if="leftoverPct(row.extra) !== null" class="budget-impact-item__of">
              · {{ leftoverPct(row.extra)!.toFixed(0) }}% of leftover
            </span>
          </span>
        </div>
        <div class="budget-impact-item__bar">
          <span
            v-if="row.purchases > 0"
            class="budget-impact-item__seg budget-impact-item__seg--purchase"
            :style="{ width: widthPct(row.purchases) + '%' }"
          />
          <span
            v-if="row.unexpected > 0"
            class="budget-impact-item__seg budget-impact-item__seg--unexpected"
            :style="{ width: widthPct(row.unexpected) + '%' }"
          />
        </div>
        <div class="budget-impact-item__foot">
          <span class="budget-impact-item__split">
            <span v-if="row.purchases > 0">{{ fmt(row.purchases) }} purchases</span>
            <span v-if="row.purchases > 0 && row.unexpected > 0"> · </span>
            <span v-if="row.unexpected > 0">{{ fmt(row.unexpected) }} unexpected</span>
          </span>
          <button
            v-if="row.items.length"
            type="button"
            class="budget-impact-item__toggle"
            :aria-expanded="!!expanded[row.id]"
            @click="toggle(row.id)"
          >
            {{ expanded[row.id] ? 'Hide' : 'See' }}
            {{ row.items.length }} {{ row.items.length === 1 ? 'entry' : 'entries' }}
          </button>
        </div>
        <ul v-if="expanded[row.id]" class="impact-txn-list list-unstyled">
          <li
            v-for="item in row.items"
            :key="item.kind + '-' + item.id"
            class="impact-txn"
          >
            <span
              class="impact-txn__dot"
              :class="
                item.kind === 'purchase'
                  ? 'impact-txn__dot--purchase'
                  : 'impact-txn__dot--unexpected'
              "
              aria-hidden="true"
            />
            <span class="impact-txn__main">
              <span class="impact-txn__label">{{ item.label }}</span>
              <span class="impact-txn__meta">
                {{ txKindLabel(item) }}
                <template v-if="txDate(item.date)"> · {{ txDate(item.date) }}</template>
              </span>
            </span>
            <span class="impact-txn__amt">{{ fmt(item.amount) }}</span>
          </li>
        </ul>
      </li>
    </ul>
  </div>
  <p v-else class="expenses-panel__empty small mb-0">
    {{ emptyHint ?? 'Log a purchase or unexpected expense to see how it eats into your leftover.' }}
  </p>
</template>
