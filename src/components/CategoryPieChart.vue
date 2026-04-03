<script setup lang="ts">
import { computed } from 'vue';
import { Pie } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
} from 'chart.js';
import type { BudgetCategory } from '../shared/types';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps<{
  categories: BudgetCategory[];
}>();

const data = computed<ChartData<'pie'>>(() => ({
  labels: props.categories.map((c) => c.label),
  datasets: [
    {
      data: props.categories.map((c) => c.targetPercent),
      backgroundColor: props.categories.map((c) => c.color),
    },
  ],
}));

const options = {
  responsive: true,
  maintainAspectRatio: true,
};
</script>

<template>
  <div class="category-pie-chart">
    <Pie :data="data" :options="options" />
  </div>
</template>

