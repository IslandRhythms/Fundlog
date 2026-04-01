<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';

const domain = useDomainStore();
const name = ref('');
const startMonth = ref('');
const monthlyIncome = ref<number | null>(null);
const ruleSet = ref<'fiftyThirtyTwenty' | 'custom'>('fiftyThirtyTwenty');

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadBudgets();
});

const budgets = computed(() => domain.budgets);
async function submit() {
  if (!name.value || !startMonth.value || !monthlyIncome.value) return;
  await domain.createBudget({
    name: name.value.trim(),
    startMonth: startMonth.value,
    monthlyIncome: monthlyIncome.value,
    ruleSet: ruleSet.value,
  });
  name.value = '';
  startMonth.value = '';
  monthlyIncome.value = null;
  ruleSet.value = 'fiftyThirtyTwenty';
}
</script>

<template>
  <div class="view">
    <h2>Budgets</h2>
    <p class="view-subtitle">
      Create separate budgets and choose the 50/30/20 rule or a custom structure.
    </p>

    <div class="card-grid">
      <div class="card card-form">
        <h3>Create budget</h3>
        <form class="form-grid" @submit.prevent="submit">
          <label>
            <span>Name</span>
            <input v-model="name" type="text" placeholder="Primary budget" />
          </label>
          <label>
            <span>Start month</span>
            <input v-model="startMonth" type="month" />
          </label>
          <label>
            <span>Monthly income</span>
            <input
              v-model.number="monthlyIncome"
              type="number"
              min="0"
              step="0.01"
              placeholder="4000"
            />
          </label>
          <label>
            <span>Rule set</span>
            <select v-model="ruleSet">
              <option value="fiftyThirtyTwenty">50 / 30 / 20</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <button class="primary-button" type="submit">
            Save budget
          </button>
        </form>
      </div>

      <div class="card card-list">
        <h3>Existing budgets</h3>
        <div v-if="budgets.length === 0" class="empty-state">
          <p>No budgets yet. Create your first budget to get started.</p>
        </div>
        <ul v-else class="budget-list">
          <li v-for="b in budgets" :key="b.id" class="budget-row">
            <div class="budget-main">
              <div class="budget-name">
                {{ b.name }}
                <span v-if="b.isActive" class="badge">Active</span>
              </div>
              <div class="budget-meta">
                <span>From {{ b.startMonth }}</span>
                <span>Income {{ b.monthlyIncome.toLocaleString() }}</span>
                <span>{{ b.ruleSet === 'fiftyThirtyTwenty' ? '50 / 30 / 20' : 'Custom' }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

