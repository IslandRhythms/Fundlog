<script setup lang="ts">
import { computed } from 'vue';
import CategoryPieChart from './CategoryPieChart.vue';
import {
  alignPieSegmentsToCategories,
  buildTargetPieSegments,
} from '../shared/plannedExpenseBar';
import type { BudgetCategory } from '../shared/types';
import type { PlannedBarSeg } from '../shared/plannedExpenseBar';

const props = withDefaults(
  defineProps<{
    categories: BudgetCategory[];
    actualSegments: PlannedBarSeg[];
    income: number;
    currencyCode: string;
    actualTitle?: string;
    targetTitle?: string;
    actualCaption?: string;
    targetCaption?: string;
  }>(),
  {
    actualTitle: 'This month',
    targetTitle: 'Target',
  },
);

const alignedActual = computed(() =>
  alignPieSegmentsToCategories(props.actualSegments, props.categories),
);

const targetSegments = computed(() =>
  buildTargetPieSegments(props.categories, props.income),
);

const hasActual = computed(() => alignedActual.value.length > 0);
const hasTarget = computed(() => props.categories.length > 0);
</script>

<template>
  <div class="budget-pie-compare" role="group" aria-label="Income allocation comparison">
    <div class="budget-pie-compare__col">
      <header class="budget-pie-compare__header">
        <h4 class="budget-pie-compare__title">{{ actualTitle }}</h4>
        <p v-if="actualCaption" class="budget-pie-compare__caption">{{ actualCaption }}</p>
      </header>
      <CategoryPieChart
        v-if="hasActual"
        compare
        :segments="alignedActual"
        :income="income"
        :currency-code="currencyCode"
      />
      <p v-else class="budget-pie-compare__empty small mb-0">
        Add expenses to see your spending mix.
      </p>
    </div>

    <div class="budget-pie-compare__axis" aria-hidden="true" />

    <div class="budget-pie-compare__col">
      <header class="budget-pie-compare__header">
        <h4 class="budget-pie-compare__title">{{ targetTitle }}</h4>
        <p v-if="targetCaption" class="budget-pie-compare__caption">{{ targetCaption }}</p>
      </header>
      <CategoryPieChart
        v-if="hasTarget"
        compare
        :segments="targetSegments"
        :income="income"
        :currency-code="currencyCode"
      />
      <p v-else class="budget-pie-compare__empty small mb-0">
        No category targets configured.
      </p>
    </div>
  </div>
</template>
