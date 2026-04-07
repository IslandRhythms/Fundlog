<script setup lang="ts">
import type { PlannedBarSeg } from '../shared/plannedExpenseBar';

defineProps<{
  categoryParts: PlannedBarSeg[];
  unallocatedBarPct: number;
  emptyHint: string;
  ariaLabel?: string;
}>();

function segmentTitle(seg: PlannedBarSeg): string {
  const base = `${seg.label}: ${seg.planned.toLocaleString()} planned`;
  const extra: string[] = [];
  if (seg.unexpected > 0) {
    extra.push(`${seg.unexpected.toLocaleString()} unexpected`);
  }
  if (seg.goalSavings > 0) {
    extra.push(`${seg.goalSavings.toLocaleString()} goal savings`);
  }
  const tail = extra.length ? ` + ${extra.join(' + ')}` : '';
  return `${base}${tail} (${seg.pctOfIncome.toFixed(1)}% of income)`;
}
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
      <div
        v-for="seg in categoryParts"
        :key="seg.categoryId"
        role="presentation"
        :style="{
          width: seg.barWidthPct + '%',
          backgroundColor: seg.color,
          minWidth: seg.barWidthPct > 0 ? '2px' : '0',
        }"
        :title="segmentTitle(seg)"
      />
      <div
        v-if="unallocatedBarPct > 0.05"
        role="presentation"
        class="planned-bar-unallocated"
        :style="{ width: unallocatedBarPct + '%' }"
        title="Income not yet reflected in planned, unexpected, or goal savings"
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
            ({{ seg.planned.toLocaleString() }}
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
