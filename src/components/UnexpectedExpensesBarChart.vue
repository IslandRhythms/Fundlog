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

export type UnexpectedBarSegment = {
  label: string;
  color: string;
  amount: number;
  count: number;
};

const props = defineProps<{
  segments: UnexpectedBarSegment[];
  metric: 'amount' | 'count';
}>();

const data = computed<ChartData<'bar'>>(() => {
  const segs = props.segments;
  return {
    labels: segs.map((s) => s.label),
    datasets: [
      {
        label: props.metric === 'amount' ? 'Total amount' : 'Times added',
        data: segs.map((s) => (props.metric === 'amount' ? s.amount : s.count)),
        backgroundColor: segs.map((s) => s.color),
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
        label: (ctx) => {
          const raw = ctx.raw;
          const v = typeof raw === 'number' ? raw : Number(raw);
          if (props.metric === 'amount') {
            return v.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }
          return `${v} ${v === 1 ? 'entry' : 'entries'}`;
        },
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: {
        precision: props.metric === 'count' ? 0 : undefined,
      },
    },
  },
}));
</script>

<template>
  <div v-if="segments.length" class="unexpected-expenses-bar-chart">
    <Bar :data="data" :options="options" />
  </div>
</template>
