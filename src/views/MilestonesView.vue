<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import { confirmAction } from '../shared/confirmAction';
import { errorMessageFromUnknown } from '../shared/errors';
import { formatPercent } from '../shared/formatMoney';
import { MILESTONE_CATEGORIES } from '../shared/milestoneCategories';
import type { FinancialMilestone } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const milestones = ref<FinancialMilestone[]>([]);
const loading = ref(false);

const editingMilestone = ref<FinancialMilestone | null>(null);
const formTitle = ref('');
const formCategory = ref('');
const formTargetDate = ref('');
const formNote = ref('');
const formAchieved = ref(false);
const formAchievedDate = ref('');
const submitting = ref(false);

const activeProfileId = computed(() => domain.activeProfileId);

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Soonest target date first; milestones without a date go last. */
const inProgress = computed(() =>
  milestones.value
    .filter((m) => !m.achievedDate)
    .sort((a, b) => {
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
      if (a.targetDate) return -1;
      if (b.targetDate) return 1;
      return a.sortOrder - b.sortOrder;
    }),
);

/** Most recently reached first. */
const achieved = computed(() =>
  milestones.value
    .filter((m) => m.achievedDate)
    .sort((a, b) => (b.achievedDate ?? '').localeCompare(a.achievedDate ?? '')),
);

const sections = computed(() => [
  { key: 'progress', label: 'In progress', items: inProgress.value },
  { key: 'achieved', label: 'Reached', items: achieved.value },
]);

const achievedPct = computed(() =>
  milestones.value.length ? (achieved.value.length / milestones.value.length) * 100 : 0,
);

function isPastTarget(m: FinancialMilestone): boolean {
  return !m.achievedDate && !!m.targetDate && m.targetDate < todayIso();
}

async function loadMilestones() {
  if (!activeProfileId.value) {
    milestones.value = [];
    return;
  }
  loading.value = true;
  try {
    milestones.value = await window.fundlog.milestone.listByProfile(activeProfileId.value);
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Failed to load milestones.'));
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await loadMilestones();
});

watch(
  () => domain.activeProfileId,
  async () => {
    editingMilestone.value = null;
    await loadMilestones();
  },
);

function openAddModal() {
  editingMilestone.value = null;
  formTitle.value = '';
  formCategory.value = '';
  formTargetDate.value = '';
  formNote.value = '';
  formAchieved.value = false;
  formAchievedDate.value = '';
}

function openEditModal(m: FinancialMilestone) {
  editingMilestone.value = m;
  formTitle.value = m.title;
  formCategory.value = m.category ?? '';
  formTargetDate.value = m.targetDate ?? '';
  formNote.value = m.note ?? '';
  formAchieved.value = !!m.achievedDate;
  formAchievedDate.value = m.achievedDate ?? '';
}

function onFormAchievedChange() {
  if (formAchieved.value && !formAchievedDate.value) {
    formAchievedDate.value = todayIso();
  }
}

async function submitMilestone() {
  if (!activeProfileId.value || !formTitle.value.trim()) return;
  const payload = {
    profileId: activeProfileId.value,
    title: formTitle.value.trim(),
    category: formCategory.value || null,
    targetDate: formTargetDate.value || null,
    note: formNote.value.trim() || null,
    achievedDate: formAchieved.value ? formAchievedDate.value || todayIso() : null,
  };
  submitting.value = true;
  try {
    if (editingMilestone.value) {
      await window.fundlog.milestone.update({ ...payload, id: editingMilestone.value.id });
      toast.success('Milestone updated.');
    } else {
      await window.fundlog.milestone.create(payload);
      toast.success('Milestone added.');
    }
    editingMilestone.value = null;
    await loadMilestones();
    hideBsModal('milestoneModal');
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not save milestone.'));
  } finally {
    submitting.value = false;
  }
}

async function toggleAchieved(m: FinancialMilestone) {
  if (!activeProfileId.value) return;
  const reached = !m.achievedDate;
  try {
    await window.fundlog.milestone.setAchieved({
      id: m.id,
      profileId: activeProfileId.value,
      achievedDate: reached ? todayIso() : null,
    });
    if (reached) toast.success(`Milestone reached: ${m.title}`);
    await loadMilestones();
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not update milestone.'));
  }
}

async function removeMilestone(m: FinancialMilestone) {
  if (!activeProfileId.value) return;
  const ok = await confirmAction(`Delete “${m.title}”?`, { title: 'Remove milestone' });
  if (!ok) return;
  try {
    await window.fundlog.milestone.delete({ id: m.id, profileId: activeProfileId.value });
    toast.success('Milestone removed.');
    await loadMilestones();
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not delete milestone.'));
  }
}
</script>

<template>
  <div class="view milestones-view container-fluid">
    <h2 class="mb-2">Financial Milestones</h2>
    <p class="view-subtitle mb-2 small">
      Big moments worth working toward — owning a home, hitting a portfolio number, becoming
      debt-free. Check them off as you reach them.
    </p>

    <p v-if="!activeProfileId" class="status-text">
      Create a profile in Settings to track milestones.
    </p>

    <template v-else>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#milestoneModal"
          @click="openAddModal"
        >
          Add milestone
        </button>
      </div>

      <div v-if="loading" class="milestones-empty-hint mb-3">
        <LoadingView message="Loading milestones…" />
      </div>

      <template v-else>
        <div v-if="!milestones.length" class="milestones-empty-hint mb-3">
          <p class="milestones-empty-title">No milestones yet</p>
          <p class="milestones-empty-muted mb-0">
            Add something you want to reach, like <strong>Buy a house</strong> or
            <strong>$100k invested</strong>, then check it off when it happens.
          </p>
        </div>

        <template v-else>
          <div class="card milestones-card border shadow-none mb-4">
            <div class="card-body p-3">
              <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2">
                <div>
                  <div class="milestones-section-label mb-1">Progress</div>
                  <div class="h4 mb-0">
                    {{ achieved.length }} of {{ milestones.length }} reached
                  </div>
                </div>
                <span class="small text-muted">{{ formatPercent(achievedPct) }}%</span>
              </div>
              <div class="progress" style="height: 6px">
                <div
                  class="progress-bar bg-success"
                  role="progressbar"
                  :style="{ width: achievedPct + '%' }"
                  :aria-valuenow="Math.round(achievedPct)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
            </div>
          </div>

          <div v-for="section in sections" :key="section.key" class="mb-4">
            <template v-if="section.items.length">
              <div class="milestones-section-label mb-2">
                {{ section.label }} · {{ section.items.length }}
              </div>
              <ul class="list-group milestones-card">
                <li
                  v-for="m in section.items"
                  :key="m.id"
                  class="list-group-item bg-transparent border-secondary-subtle d-flex flex-column flex-sm-row gap-3 align-items-sm-start py-3"
                  :class="{ 'milestone-item--achieved': !!m.achievedDate }"
                >
                  <div class="form-check flex-grow-1 min-w-0 mb-0">
                    <input
                      :id="`milestone-check-${m.id}`"
                      class="form-check-input"
                      type="checkbox"
                      :checked="!!m.achievedDate"
                      @change="toggleAchieved(m)"
                    />
                    <label
                      class="form-check-label d-block"
                      :for="`milestone-check-${m.id}`"
                    >
                      <span class="milestone-title fw-semibold text-break">{{ m.title }}</span>
                    </label>
                    <div class="d-flex flex-wrap align-items-center gap-2 small mt-1">
                      <span
                        v-if="m.category"
                        class="badge rounded-pill bg-transparent text-body-secondary border border-secondary-subtle fw-normal"
                      >
                        {{ m.category }}
                      </span>
                      <span v-if="m.achievedDate" class="text-success">
                        Reached {{ formatShortDate(m.achievedDate) }}
                      </span>
                      <span v-else-if="m.targetDate" :class="isPastTarget(m) ? 'text-danger' : 'text-muted'">
                        Target {{ formatShortDate(m.targetDate) }}
                        <template v-if="isPastTarget(m)"> · past target date</template>
                      </span>
                    </div>
                    <p v-if="m.note" class="small text-body-secondary mb-0 mt-1">{{ m.note }}</p>
                  </div>
                  <div class="d-flex flex-wrap gap-2 flex-shrink-0">
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      data-bs-toggle="modal"
                      data-bs-target="#milestoneModal"
                      @click="openEditModal(m)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      @click="removeMilestone(m)"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              </ul>
            </template>
          </div>
        </template>
      </template>
    </template>
  </div>

  <div
    id="milestoneModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="milestoneModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="milestoneModalLabel" class="modal-title">
            {{ editingMilestone ? 'Edit milestone' : 'Add milestone' }}
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label" for="milestoneTitle">
              Title <span class="text-danger">*</span>
            </label>
            <input
              id="milestoneTitle"
              v-model="formTitle"
              type="text"
              class="form-control"
              placeholder="Buy a house, $100k invested…"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="milestoneCategory">Type</label>
            <select id="milestoneCategory" v-model="formCategory" class="form-select">
              <option value="">None</option>
              <option v-for="c in MILESTONE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="milestoneTargetDate">Target date</label>
            <input
              id="milestoneTargetDate"
              v-model="formTargetDate"
              type="date"
              class="form-control"
            />
          </div>
          <div class="col-12">
            <label class="form-label" for="milestoneNote">Notes</label>
            <textarea
              id="milestoneNote"
              v-model="formNote"
              class="form-control"
              rows="2"
              placeholder="Optional"
            />
          </div>
          <div class="col-sm-6 d-flex align-items-end">
            <div class="form-check mb-2">
              <input
                id="milestoneAchieved"
                v-model="formAchieved"
                class="form-check-input"
                type="checkbox"
                @change="onFormAchievedChange"
              />
              <label class="form-check-label" for="milestoneAchieved">Reached</label>
            </div>
          </div>
          <div v-if="formAchieved" class="col-sm-6">
            <label class="form-label" for="milestoneAchievedDate">Date reached</label>
            <input
              id="milestoneAchievedDate"
              v-model="formAchievedDate"
              type="date"
              class="form-control"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!formTitle.trim() || submitting"
            @click="submitMilestone"
          >
            {{ editingMilestone ? 'Save' : 'Add' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
