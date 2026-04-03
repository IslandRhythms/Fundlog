<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';

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

const goals = computed(() =>
  [...domain.goals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

async function submit() {
  if (!name.value || !targetAmount.value) return;
  const ok = await domain.createGoal({
    name: name.value.trim(),
    targetAmount: targetAmount.value,
    targetDate: targetDate.value,
    priority: priority.value,
    note: note.value || null,
  });
  if (!ok) return;
  name.value = '';
  targetAmount.value = null;
  targetDate.value = null;
  priority.value = 1;
  note.value = '';
  hideBsModal('createGoalModal');
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Goals</h2>
    <p class="view-subtitle mb-4">
      Define financial goals and track your progress over time.
    </p>
    <div class="row g-3">
      <div class="col-12">
        <section class="card card-list stacked-section h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Active goals</h3>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                data-bs-toggle="modal"
                data-bs-target="#createGoalModal"
              >
                New goal
              </button>
            </div>
            <div v-if="goals.length === 0" class="alert alert-info mt-3">
              No goals yet. Create your first goal to start tracking progress.
            </div>
            <ul v-else class="list-unstyled mt-3">
              <li v-for="g in goals" :key="g.id" class="mb-2">
                <div class="d-flex flex-column border rounded p-2 bg-dark bg-opacity-50">
                  <div class="d-flex align-items-center mb-1">
                    <span class="fw-semibold me-2">{{ g.name }}</span>
                    <span class="badge bg-success">Priority {{ g.priority }}</span>
                  </div>
                  <div class="small text-muted d-flex flex-wrap gap-2">
                    <span>Target {{ g.targetAmount.toLocaleString() }}</span>
                    <span v-if="g.targetDate">By {{ g.targetDate }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="createGoalModal"
    tabindex="-1"
    aria-labelledby="createGoalModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createGoalModalLabel">Create goal</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submit">
          <div class="modal-body row g-3">
            <div class="col-12">
              <label class="form-label">
                Name
                <input v-model="name" type="text" class="form-control" placeholder="Emergency fund" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Target amount
                <input
                  v-model.number="targetAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  placeholder="5000"
                />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Target date
                <input v-model="targetDate" type="date" class="form-control" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Priority (1–5)
                <input v-model.number="priority" type="number" min="1" max="5" class="form-control" />
              </label>
            </div>
            <div class="col-12">
              <label class="form-label">
                Note
                <textarea
                  v-model="note"
                  rows="2"
                  class="form-control"
                  placeholder="Why this goal matters"
                ></textarea>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button type="submit" class="btn btn-success">
              Save goal
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>


