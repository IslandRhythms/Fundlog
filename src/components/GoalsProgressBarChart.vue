<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export type GoalProgressSegment = {
  label: string;
  fullLabel: string;
  progressPct: number;
  saved: number;
  target: number;
  /** Raw monthly plan from linked budget lines (before capping to remaining gap). */
  planThisMonth?: number;
};

const props = defineProps<{
  segments: GoalProgressSegment[];
  currencyCode: string;
}>();

function formatCurrency(amount: number, code: string) {
  const c = code?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: c });
  } catch {
    return `${amount.toLocaleString()} ${c}`;
  }
}

const data = computed<ChartData<'bar'>>(() => {
  const segs = props.segments;
  return {
    labels: segs.map((s) => s.label),
    datasets: [
      {
        label: 'Progress',
        data: segs.map((s) => s.progressPct),
        backgroundColor: segs.map((s) =>
          s.progressPct >= 100 ? '#22c55e' : '#6366f1',
        ),
        borderRadius: 4,
      },
    ],
  };
});

const options = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: Math.min(2.2, Math.max(1.35, 0.42 * props.segments.length + 0.75)),
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => {
          const i = items[0]?.dataIndex;
          if (i == null) return '';
          return props.segments[i]?.fullLabel ?? '';
        },
        label: (ctx) => {
          const i = ctx.dataIndex;
          const seg = props.segments[i];
          if (!seg) return '';
          const code = props.currencyCode;
          const lines = [
            `${formatCurrency(seg.saved, code)} recorded of ${formatCurrency(seg.target, code)}`,
            `${seg.progressPct.toFixed(1)}% toward target`,
          ];
          const plan = seg.planThisMonth ?? 0;
          if (plan > 0 && seg.saved + 1e-9 < seg.target) {
            const capped = Math.min(plan, Math.max(0, seg.target - seg.saved));
            lines.push(
              `Up to ${formatCurrency(capped, code)} from this month’s linked budget plan`,
            );
          }
          return lines;
        },
      },
    },
  },
  scales: {
    x: {
      min: 0,
      max: 100,
      ticks: {
        callback: (value) => `${value}%`,
      },
    },
  },
}));
</script>

<template>
  <div v-if="segments.length" class="goals-progress-bar-chart">
    <Bar :data="data" :options="options" />
  </div>
</template>
