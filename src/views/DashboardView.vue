<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDomainStore } from '../stores/domain';
import CategoryPieChart from '../components/CategoryPieChart.vue';

const domain = useDomainStore();

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
});

const activeBudget = computed(() => domain.activeBudget);

const splitCategories = computed(() => {
  if (!activeBudget.value) return [];
  // For now, map 50/30/20 to synthetic categories if needed
  return [
    {
      id: 1,
      budgetId: activeBudget.value.id,
      label: 'Needs',
      ruleKey: 'needs',
      targetPercent: 50,
      color: '#6366f1',
      sortOrder: 1,
    },
    {
      id: 2,
      budgetId: activeBudget.value.id,
      label: 'Wants',
      ruleKey: 'wants',
      targetPercent: 30,
      color: '#ec4899',
      sortOrder: 2,
    },
    {
      id: 3,
      budgetId: activeBudget.value.id,
      label: 'Savings / Debt',
      ruleKey: 'savingsDebt',
      targetPercent: 20,
      color: '#22c55e',
      sortOrder: 3,
    },
  ];
});
</script>

<template>
  <div class="view">
    <h2>Dashboard</h2>
    <p class="view-subtitle">
      High-level view of this month's 50 / 30 / 20 split and progress towards your goals.
    </p>

    <div class="card-grid">
      <div class="card">
        <h3>50 / 30 / 20 allocation</h3>
        <CategoryPieChart v-if="activeBudget" :categories="splitCategories" />
        <p v-else class="empty-state">
          Create a budget to see your allocation visualized here.
        </p>
      </div>
      <div class="card">
        <h3>At-a-glance</h3>
        <p>More KPIs and goal progress bars will appear here.</p>
      </div>
    </div>
  </div>
</template>


