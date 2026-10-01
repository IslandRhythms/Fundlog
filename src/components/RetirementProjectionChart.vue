<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { useUiStore } from '../stores/ui';
import { formatMoney } from '../shared/formatMoney';
import type { FireTarget, FireTargetKey, ProjectionPoint } from '../shared/retirementCalc';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

const props = defineProps<{
  projection: ProjectionPoint[];
  targets: FireTarget[];
  currencyCode: string;
}>();

const ui = useUiStore();
const isDark = computed(() => ui.resolvedTheme === 'dark');

const TARGET_COLORS: Record<FireTargetKey, string> = {
  lean: '#14b8a6',
  regular: '#16a34a',
  fat: '#7c3aed',
  barista: '#d97706',
};
const COAST_COLOR = '#db2777';

const chartColors = computed(() => ({
  text: isDark.value ? '#e5e7eb' : '#111827',
  muted: isDark.value ? '#9ca3af' : '#6b7280',
  grid: isDark.value ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.35)',
  line: isDark.value ? '#38bdf8' : '#0ea5e9',
  fill: isDark.value ? 'rgba(56, 189, 248, 0.18)' : 'rgba(14, 165, 233, 0.12)',
  tooltipBg: isDark.value ? '#1e293b' : '#ffffff',
  tooltipBorder: isDark.value ? '#334155' : '#dee2e6',
}));

/** Targets far above the balance and the FIRE line would flatten everything else. */
const scaleCap = computed(() => {
  const maxBalance = Math.max(0, ...props.projection.map((p) => p.balance));
  const regular = props.targets.find((t) => t.key === 'regular')?.number ?? 0;
  return Math.max(maxBalance, Number.isFinite(regular) ? regular : 0) * 1.1;
});

const chartedTargets = computed(() =>
  props.targets.filter(
    (t) => Number.isFinite(t.number) && t.number > 0 && (t.key === 'regular' || t.number <= scaleCap.value),
  ),
);

const offChartTargets = computed(() =>
  props.targets.filter(
    (t) => Number.isFinite(t.number) && t.number > 0 && !chartedTargets.value.includes(t),
  ),
);

const data = computed<ChartData<'line'>>(() => {
  const colors = chartColors.value;
  const points = props.projection;
  const targetLines = chartedTargets.value
    .map((t) => ({
      label: t.label,
      data: points.map(() => t.number),
      borderColor: TARGET_COLORS[t.key],
      backgroundColor: TARGET_COLORS[t.key],
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    }));
  return {
    labels: points.map((p) => String(Math.round(p.age))),
    datasets: [
      {
        label: 'Projected balance',
        data: points.map((p) => p.balance),
        borderColor: colors.line,
        backgroundColor: colors.fill,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25,
        fill: true,
      },
      {
        label: 'Coast FIRE needed',
        data: points.map((p) => p.coastRequired),
        borderColor: COAST_COLOR,
        backgroundColor: COAST_COLOR,
        borderDash: [2, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        fill: false,
        spanGaps: false,
      },
      ...targetLines,
    ],
  };
});

const options = computed<ChartOptions<'line'>>(() => {
  const colors = chartColors.value;
  const code = props.currencyCode;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: colors.text, boxWidth: 12, boxHeight: 2, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          title(items) {
            return items[0] ? `Age ${items[0].label}` : '';
          },
          label(ctx) {
            const value = ctx.parsed.y;
            if (value == null) return '';
            return ` ${ctx.dataset.label}: ${formatMoney(value, code)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Age', color: colors.muted, font: { size: 11 } },
        ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 11 } },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: colors.muted,
          font: { size: 11 },
          callback(value) {
            const n = typeof value === 'number' ? value : Number(value);
            try {
              return n.toLocaleString(undefined, {
                style: 'currency',
                currency: code?.trim() || 'USD',
                notation: 'compact',
                maximumFractionDigits: 1,
              });
            } catch {
              return n.toLocaleString();
            }
          },
        },
        grid: { color: colors.grid },
      },
    },
  };
});
</script>

<template>
  <div v-if="projection.length">
    <div class="retirement-projection-chart">
      <Line :key="isDark ? 'dark' : 'light'" :data="data" :options="options" />
    </div>
    <p v-if="offChartTargets.length" class="small text-muted mb-0 mt-2">
      Above the chart:
      {{ offChartTargets.map((t) => `${t.label} (${formatMoney(t.number, currencyCode)})`).join(', ') }}
    </p>
  </div>
</template>

<style scoped>
.retirement-projection-chart {
  position: relative;
  height: 320px;
  width: 100%;
}
</style>
