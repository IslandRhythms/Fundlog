<script setup lang="ts">
import type { PlannedBarSeg } from '../shared/plannedExpenseBar';
import { FUND_COLORS } from '../shared/fundColors';

const props = defineProps<{
  categoryParts: PlannedBarSeg[];
  unallocatedBarPct: number;
  emptyHint: string;
  ariaLabel?: string;
}>();

type SubSeg = { key: string; color: string; widthPct: number; title: string };

function segTotal(seg: PlannedBarSeg): number {
  return seg.planned + seg.unexpected + seg.purchases + seg.goalSavings;
}

/** Split each category segment into planned / purchases / unexpected / goal savings slices. */
function subSegments(seg: PlannedBarSeg): SubSeg[] {
  const total = segTotal(seg);
  if (total <= 0) return [];
  const scale = seg.barWidthPct / total;
  const out: SubSeg[] = [];
  if (seg.planned > 0) {
    out.push({
      key: `${seg.categoryId}-planned`,
      color: seg.color,
      widthPct: seg.planned * scale,
      title: `${seg.label}: ${seg.planned.toLocaleString()} planned`,
    });
  }
  if (seg.purchases > 0) {
    out.push({
      key: `${seg.categoryId}-purchase`,
      color: FUND_COLORS.purchase,
      widthPct: seg.purchases * scale,
      title: `${seg.label}: ${seg.purchases.toLocaleString()} purchases`,
    });
  }
  if (seg.unexpected > 0) {
    out.push({
      key: `${seg.categoryId}-unexpected`,
      color: FUND_COLORS.unexpected,
      widthPct: seg.unexpected * scale,
      title: `${seg.label}: ${seg.unexpected.toLocaleString()} unexpected`,
    });
  }
  if (seg.goalSavings > 0) {
    out.push({
      key: `${seg.categoryId}-goal`,
      color: FUND_COLORS.goalSavings,
      widthPct: seg.goalSavings * scale,
      title: `${seg.label}: ${seg.goalSavings.toLocaleString()} goal savings`,
    });
  }
  return out;
}

const hasPurchases = () => props.categoryParts.some((s) => s.purchases > 0);
const hasUnexpected = () => props.categoryParts.some((s) => s.unexpected > 0);
</script>

<template>
  <div>
    <div
      v-if="categoryParts.length"
      class="category-dist-track rounded overflow-hidden d-flex mb-2"
      style="height: 12px"
      role="img"
      :aria-label="ariaLabel ?? 'Spending by category as a share of income'"
    >
      <template v-for="seg in categoryParts" :key="seg.categoryId">
        <div
          v-for="sub in subSegments(seg)"
          :key="sub.key"
          role="presentation"
          :style="{
            width: sub.widthPct + '%',
            backgroundColor: sub.color,
            minWidth: sub.widthPct > 0 ? '2px' : '0',
          }"
          :title="sub.title"
        />
      </template>
      <div
        v-if="unallocatedBarPct > 0.05"
        role="presentation"
        class="planned-bar-unallocated"
        :style="{ width: unallocatedBarPct + '%' }"
        title="Income not yet reflected in planned, purchases, unexpected, or goal savings"
      />
    </div>
    <div
      v-else
      class="category-dist-track rounded overflow-hidden mb-2"
      style="height: 12px"
      aria-hidden="true"
    />
    <ul
      v-if="categoryParts.length"
      class="list-unstyled small text-muted mb-0 d-flex flex-wrap gap-3"
    >
      <li
        v-for="seg in categoryParts"
        :key="'legend-' + seg.categoryId"
        class="d-flex align-items-center gap-1"
      >
        <span
          class="rounded-circle d-inline-block flex-shrink-0"
          style="width: 8px; height: 8px"
          :style="{ backgroundColor: seg.color }"
        />
        <span>
          {{ seg.label }} · {{ seg.pctOfIncome.toFixed(1) }}% income
          <span class="text-muted">
            ({{ seg.planned.toLocaleString() }} planned
            <template v-if="seg.purchases > 0">
              + {{ seg.purchases.toLocaleString() }} purchases
            </template>
            <template v-if="seg.unexpected > 0">
              + {{ seg.unexpected.toLocaleString() }} unexpected
            </template>
            <template v-if="seg.goalSavings > 0">
              + {{ seg.goalSavings.toLocaleString() }} goal savings
            </template>
            )
          </span>
        </span>
      </li>
      <li v-if="hasPurchases()" class="d-flex align-items-center gap-1">
        <span
          class="rounded d-inline-block flex-shrink-0"
          style="width: 8px; height: 8px"
          :style="{ backgroundColor: FUND_COLORS.purchase }"
        />
        <span>Purchases</span>
      </li>
      <li v-if="hasUnexpected()" class="d-flex align-items-center gap-1">
        <span
          class="rounded d-inline-block flex-shrink-0"
          style="width: 8px; height: 8px"
          :style="{ backgroundColor: FUND_COLORS.unexpected }"
        />
        <span>Unexpected</span>
      </li>
      <li v-if="unallocatedBarPct > 0.05" class="d-flex align-items-center gap-1">
        <span
          class="planned-bar-unallocated-swatch rounded-circle d-inline-block flex-shrink-0"
          style="width: 8px; height: 8px"
        />
        <span>
          Unallocated income ·
          {{ unallocatedBarPct.toFixed(1) }}%
        </span>
      </li>
    </ul>
    <p v-else class="small text-muted mb-0">
      {{ emptyHint }}
    </p>
  </div>
</template>
