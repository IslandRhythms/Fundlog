<script setup lang="ts">
import { computed } from 'vue';
import { Pie } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { useUiStore } from '../stores/ui';
import { formatMoney, formatPercent } from '../shared/formatMoney';
import {
  segmentCommittedAmount,
  segmentPieSliceValue,
} from '../shared/plannedExpenseBar';
import type { BudgetCategory } from '../shared/types';
import type { PlannedBarSeg } from '../shared/plannedExpenseBar';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    categories?: BudgetCategory[];
    segments?: PlannedBarSeg[];
    income?: number;
    currencyCode?: string;
    title?: string;
    /** Side-by-side comparison layout: fixed size, aligned rotation. */
    compare?: boolean;
    /** Pie start angle in degrees (-90 = first slice at 12 o'clock). */
    rotation?: number;
  }>(),
  {
    compare: false,
    rotation: -90,
  },
);

const ui = useUiStore();

const isDark = computed(() => ui.resolvedTheme === 'dark');

const chartColors = computed(() => ({
  text: isDark.value ? '#e5e7eb' : '#111827',
  muted: isDark.value ? '#9ca3af' : '#6b7280',
  border: isDark.value ? '#0f172a' : '#ffffff',
  tooltipBg: isDark.value ? '#1e293b' : '#ffffff',
  tooltipBorder: isDark.value ? '#334155' : '#dee2e6',
}));

const data = computed<ChartData<'pie'>>(() => {
  const border = chartColors.value.border;
  if (props.segments?.length) {
    return {
      labels: props.segments.map((s) => s.label),
      datasets: [
        {
          data: props.segments.map((s) => segmentPieSliceValue(s)),
          backgroundColor: props.segments.map((s) => s.color),
          borderColor: props.segments.map(() => border),
          borderWidth: 2,
        },
      ],
    };
  }
  const cats = props.categories ?? [];
  return {
    labels: cats.map((c) => c.label),
    datasets: [
      {
        data: cats.map((c) => c.targetPercent),
        backgroundColor: cats.map((c) => c.color),
        borderColor: cats.map(() => border),
        borderWidth: 2,
      },
    ],
  };
});

const options = computed<ChartOptions<'pie'>>(() => {
  const colors = chartColors.value;
  const currency = props.currencyCode ?? 'USD';
  const income = props.income ?? 0;
  return {
    responsive: true,
    maintainAspectRatio: !props.compare,
    rotation: props.rotation,
    circumference: 360,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: colors.text,
          padding: props.compare ? 10 : 14,
          font: { size: props.compare ? 11 : 12, weight: 500 },
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label(ctx) {
            if (props.segments?.length) {
              const seg = props.segments[ctx.dataIndex];
              if (!seg) return '';
              const amount = segmentCommittedAmount(seg, income);
              const pct = formatPercent(seg.barWidthPct);
              return ` ${formatMoney(amount, currency)} (${pct}% of income)`;
            }
            const value = ctx.parsed;
            return ` ${formatPercent(value)}% target`;
          },
        },
      },
    },
  };
});
</script>

<template>
  <div
    class="category-pie-chart"
    :class="{
      'where-it-goes-chart': !compare,
      'category-pie-chart--compare': compare,
    }"
  >
    <p v-if="title" class="category-pie-chart__title small mb-2">{{ title }}</p>
    <div class="category-pie-chart__canvas" :class="{ 'category-pie-chart__canvas--compare': compare }">
      <Pie :key="isDark ? 'dark' : 'light'" :data="data" :options="options" />
    </div>
  </div>
</template>
