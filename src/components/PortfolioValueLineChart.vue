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
import type { PortfolioSnapshot } from '../shared/types';

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
  snapshots: PortfolioSnapshot[];
  currencyCode: string;
}>();

const ui = useUiStore();
const isDark = computed(() => ui.resolvedTheme === 'dark');

const chartColors = computed(() => ({
  text: isDark.value ? '#e5e7eb' : '#111827',
  muted: isDark.value ? '#9ca3af' : '#6b7280',
  grid: isDark.value ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.35)',
  line: isDark.value ? '#38bdf8' : '#0ea5e9',
  fill: isDark.value ? 'rgba(56, 189, 248, 0.18)' : 'rgba(14, 165, 233, 0.12)',
  tooltipBg: isDark.value ? '#1e293b' : '#ffffff',
  tooltipBorder: isDark.value ? '#334155' : '#dee2e6',
}));

function formatDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const data = computed<ChartData<'line'>>(() => {
  const colors = chartColors.value;
  const snaps = props.snapshots;
  return {
    labels: snaps.map((s) => formatDateLabel(s.date)),
    datasets: [
      {
        label: 'Value',
        data: snaps.map((s) => s.value),
        borderColor: colors.line,
        backgroundColor: colors.fill,
        pointBackgroundColor: colors.line,
        pointBorderColor: colors.line,
        pointRadius: snaps.length === 1 ? 4 : 3,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: true,
      },
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
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        callbacks: {
          label(ctx) {
            const value = ctx.parsed.y;
            if (value == null) return '';
            return ` ${formatMoney(value, code)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: colors.muted,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          font: { size: 11 },
        },
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
  <div v-if="snapshots.length" class="portfolio-value-line-chart">
    <Line :key="isDark ? 'dark' : 'light'" :data="data" :options="options" />
  </div>
</template>

<style scoped>
.portfolio-value-line-chart {
  position: relative;
  height: 220px;
  width: 100%;
}
</style>
