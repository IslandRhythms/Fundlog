<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import type { Goal, Profile } from '../shared/types';

const domain = useDomainStore();

const name = ref('');
const targetAmount = ref<number | null>(null);
const targetDate = ref('');
const priority = ref(3);
const note = ref('');
const formError = ref<string | null>(null);
const showOnDashboardNew = ref(true);

const priorityOptions: { value: number; label: string }[] = [
  { value: 5, label: '5 — Highest (break ties on Dashboard)' },
  { value: 4, label: '4 — High' },
  { value: 3, label: '3 — Medium' },
  { value: 2, label: '2 — Lower' },
  { value: 1, label: '1 — Lowest' },
];

onMounted(async () => {
  await domain.loadProfiles();
  await domain.loadGoals();
});

const activeProfile = computed<Profile | null>(() => {
  const id = domain.activeProfileId;
  if (!id) return null;
  return domain.profiles.find((p) => p.id === id) ?? null;
});

const goals = computed(() =>
  [...domain.goals].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.createdAt.localeCompare(a.createdAt);
  }),
);

const dashboardEligibleCount = computed(
  () => goals.value.filter((g) => g.showOnDashboard).length,
);

function formatMoney(amount: number, currencyCode: string) {
  const code = currencyCode?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, { style: 'currency', currency: code });
  } catch {
    return `${amount.toLocaleString()} ${code}`;
  }
}

function formatTargetDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function resetGoalForm() {
  formError.value = null;
  name.value = '';
  targetAmount.value = null;
  targetDate.value = '';
  priority.value = 3;
  note.value = '';
  showOnDashboardNew.value = true;
}

function openCreateGoalModal() {
  resetGoalForm();
}

async function submit() {
  formError.value = null;
  if (!name.value?.trim()) {
    formError.value = 'Enter a short name for this goal.';
    return;
  }
  if (targetAmount.value == null || targetAmount.value <= 0 || !Number.isFinite(targetAmount.value)) {
    formError.value = 'Enter a positive target amount.';
    return;
  }
  const ok = await domain.createGoal({
    name: name.value.trim(),
    targetAmount: targetAmount.value,
    targetDate: targetDate.value || null,
    priority: priority.value,
    note: note.value.trim() || null,
    showOnDashboard: showOnDashboardNew.value,
  });
  if (!ok) return;
  resetGoalForm();
  hideBsModal('createGoalModal');
}

function priorityLabel(p: number) {
  const o = priorityOptions.find((x) => x.value === p);
  return o ? o.label.split(' — ')[1] ?? `Priority ${p}` : `Priority ${p}`;
}

async function onGoalDashboardToggle(g: Goal, ev: Event) {
  const el = ev.target as HTMLInputElement;
  const next = el.checked;
  const ok = await domain.updateGoal({ id: g.id, showOnDashboard: next });
  if (!ok) el.checked = !next;
}

async function onGoalPriorityChange(g: Goal, ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const prev = g.priority;
  const next = Number(el.value);
  if (!Number.isFinite(next) || next < 1 || next > 5) {
    el.value = String(prev);
    return;
  }
  const ok = await domain.updateGoal({ id: g.id, priority: next });
  if (!ok) el.value = String(prev);
}
</script>

<template>
  <div class="view goals-view container-fluid">
    <h2 class="mb-2">Goals</h2>
    <p class="view-subtitle mb-3">
      Set savings or debt targets for your <strong>active profile</strong>. They appear on the
      <RouterLink to="/dashboard">Dashboard</RouterLink>
      so your top priorities stay visible while you budget day to day.
    </p>

    <p v-if="!domain.activeProfileId" class="status-text mb-4">
      Create a profile in
      <RouterLink to="/settings">Settings</RouterLink>
      first. Goals belong to one profile at a time (the one marked active).
    </p>

    <template v-else>
      <section class="goals-explainer card border shadow-none mb-4">
        <div class="card-body py-3">
          <h3 class="h6 goals-explainer-title mb-2">How goals work in Fundlog</h3>
          <ul class="goals-explainer-list mb-0 small">
            <li>
              <strong>Targets only</strong> — you define a name, amount, optional deadline, and how
              important it is (priority). Fundlog does not move money; it keeps the target in
              sight next to your budget.
            </li>
            <li>
              <strong>Dashboard</strong> — toggle <strong>Show on dashboard</strong> below for up
              to three slots (among those enabled, highest priority appears first). Reprioritize with
              the priority menu on each goal.
            </li>
            <li>
              <strong>Budgets</strong> — keep using
              <RouterLink to="/budgets">Budgets</RouterLink>
              and
              <RouterLink to="/expenses">Expenses</RouterLink>
              for monthly plans; goals are the longer-term “why” behind them.
            </li>
          </ul>
        </div>
      </section>

      <div class="row g-3">
        <div class="col-12">
          <section class="card card-list stacked-section h-100 goals-panel border shadow-none">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h3 class="h5 card-title mb-0">Your goals</h3>
                  <p class="small text-muted mb-0 goals-panel-sub">
                    Profile: <strong>{{ activeProfile?.name }}</strong>
                    · {{ activeProfile?.currencyCode }} amounts
                    ·
                    <span class="text-body-secondary">{{ dashboardEligibleCount }} on Dashboard</span>
                    (shows top 3 by priority)
                  </p>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-bs-toggle="modal"
                  data-bs-target="#createGoalModal"
                  @click="openCreateGoalModal"
                >
                  Add goal
                </button>
              </div>

              <div v-if="!goals.length" class="goals-empty-hint">
                <p class="goals-empty-title">No goals yet</p>
                <p class="goals-empty-muted mb-3">
                  Add one for anything you’re working toward—emergency fund, payoff, trip, or major
                  purchase. Choose priority so the most important items surface on your Dashboard.
                </p>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  data-bs-toggle="modal"
                  data-bs-target="#createGoalModal"
                  @click="openCreateGoalModal"
                >
                  Add your first goal
                </button>
              </div>

              <ul
                v-else
                class="list-group list-group-flush rounded-3 border border-secondary-subtle goals-dashboard-list"
              >
                <li
                  v-for="g in goals"
                  :key="g.id"
                  class="list-group-item border-secondary-subtle px-3 px-md-4 py-4 bg-transparent"
                >
                  <div class="row g-3 align-items-start">
                    <div class="col-lg">
                      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                        <span class="fw-semibold fs-6 mb-0">{{ g.name }}</span>
                        <span
                          class="badge rounded-pill bg-transparent text-body-secondary border border-secondary-subtle fw-normal"
                        >
                          {{ priorityLabel(g.priority) }}
                        </span>
                      </div>
                      <div class="small text-muted mb-2">
                        Target
                        <strong class="text-body">{{
                          formatMoney(g.targetAmount, activeProfile?.currencyCode ?? 'USD')
                        }}</strong>
                        <template v-if="formatTargetDate(g.targetDate)">
                          · by {{ formatTargetDate(g.targetDate) }}
                        </template>
                      </div>
                      <p v-if="g.note" class="small text-body-secondary mb-0">{{ g.note }}</p>
                    </div>
                    <div class="col-lg-auto">
                      <div class="d-flex flex-column gap-3 align-items-stretch align-items-lg-end">
                        <div class="form-check form-switch mb-0">
                          <input
                            :id="'goal-dash-' + g.id"
                            class="form-check-input"
                            type="checkbox"
                            role="switch"
                            :checked="g.showOnDashboard"
                            @change="onGoalDashboardToggle(g, $event)"
                          />
                          <label class="form-check-label small" :for="'goal-dash-' + g.id">
                            Show on Dashboard
                          </label>
                        </div>
                        <div class="d-flex flex-column gap-1 w-100" style="max-width: 15rem">
                          <label class="form-label small mb-0 text-muted">Reprioritize</label>
                          <select
                            class="form-select form-select-sm"
                            :value="g.priority"
                            @change="onGoalPriorityChange(g, $event)"
                          >
                            <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                              {{ opt.label }}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>

  <div
    class="modal fade"
    id="createGoalModal"
    tabindex="-1"
    aria-labelledby="createGoalModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title" id="createGoalModalLabel">Add goal</h5>
            <p class="goals-modal-lead small text-muted mb-0">
              Saved to profile <strong>{{ activeProfile?.name ?? '…' }}</strong>
            </p>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submit">
          <div class="modal-body">
            <p class="goals-modal-intro small">
              Give this goal a clear name and target. Among goals with <strong>Show on Dashboard</strong>
              on, higher priority (5) fills a slot before lower priority; only three fit on the
              overview.
            </p>

            <div
              v-if="formError"
              class="rounded border border-danger border-opacity-25 px-3 py-2 small mb-3 text-danger"
              role="alert"
            >
              {{ formError }}
            </div>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label" for="goal-name">Goal name</label>
                <input
                  id="goal-name"
                  v-model="name"
                  type="text"
                  class="form-control"
                  placeholder="e.g. Emergency fund, Pay off card, Vacation"
                  autocomplete="off"
                />
              </div>
              <div class="col-md-6">
                <label class="form-label" for="goal-amount">Target amount</label>
                <div class="input-group">
                  <span class="input-group-text">{{
                    activeProfile?.currencyCode?.trim() || 'USD'
                  }}</span>
                  <input
                    id="goal-amount"
                    v-model.number="targetAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    class="form-control"
                    placeholder="5000"
                  />
                </div>
              </div>
              <div class="col-md-6">
                <label class="form-label" for="goal-date">Target date (optional)</label>
                <input id="goal-date" v-model="targetDate" type="date" class="form-control" />
              </div>
              <div class="col-12">
                <label class="form-label" for="goal-priority">Priority</label>
                <select id="goal-priority" v-model.number="priority" class="form-select">
                  <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label" for="goal-note">Note (optional)</label>
                <textarea
                  id="goal-note"
                  v-model="note"
                  rows="3"
                  class="form-control"
                  placeholder="Why this matters, milestones, or reminders—only you see this."
                ></textarea>
              </div>
              <div class="col-12">
                <div class="form-check form-switch">
                  <input
                    id="goal-show-dashboard"
                    v-model="showOnDashboardNew"
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                  />
                  <label class="form-check-label" for="goal-show-dashboard">
                    Show on Dashboard (competes for up to three spots by priority)
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-success">Save goal</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
