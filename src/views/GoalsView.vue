<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';

const domain = useDomainStore();

const name = ref('');
const targetAmount = ref<number | null>(null);
const targetDate = ref<string | null>(null);
const priority = ref(1);
const note = ref('');

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadGoals();
});

const goals = computed(() => domain.goals);

async function submit() {
  if (!name.value || !targetAmount.value) return;
  await domain.createGoal({
    name: name.value.trim(),
    targetAmount: targetAmount.value,
    targetDate: targetDate.value,
    priority: priority.value,
    note: note.value || null,
  });
  name.value = '';
  targetAmount.value = null;
  targetDate.value = null;
  priority.value = 1;
  note.value = '';
}
</script>

<template>
  <div class="view">
    <h2>Goals</h2>
    <p class="view-subtitle">
      Define financial goals and track your progress over time.
    </p>

    <div class="card-grid">
      <div class="card card-form">
        <h3>Create goal</h3>
        <form class="form-grid" @submit.prevent="submit">
          <label>
            <span>Name</span>
            <input v-model="name" type="text" placeholder="Emergency fund" />
          </label>
          <label>
            <span>Target amount</span>
            <input
              v-model.number="targetAmount"
              type="number"
              min="0"
              step="0.01"
              placeholder="5000"
            />
          </label>
          <label>
            <span>Target date</span>
            <input v-model="targetDate" type="date" />
          </label>
          <label>
            <span>Priority (1–5)</span>
            <input v-model.number="priority" type="number" min="1" max="5" />
          </label>
          <label>
            <span>Note</span>
            <textarea v-model="note" rows="2" placeholder="Why this goal matters"></textarea>
          </label>
          <button class="primary-button" type="submit">
            Save goal
          </button>
        </form>
      </div>

      <div class="card card-list">
        <h3>Active goals</h3>
        <div v-if="goals.length === 0" class="empty-state">
          <p>No goals yet. Create your first goal to start tracking progress.</p>
        </div>
        <ul v-else class="goal-list">
          <li v-for="g in goals" :key="g.id" class="goal-row">
            <div class="goal-main">
              <div class="goal-title">
                {{ g.name }}
                <span class="badge">Priority {{ g.priority }}</span>
              </div>
              <div class="goal-meta">
                <span>Target {{ g.targetAmount.toLocaleString() }}</span>
                <span v-if="g.targetDate">By {{ g.targetDate }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>


