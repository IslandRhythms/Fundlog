<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import { useUiStore } from '../stores/ui';

const domain = useDomainStore();
const ui = useUiStore();

const profileName = ref('');
const profileCurrency = ref('USD');
const profileStartingMonth = ref('');

onMounted(async () => {
  await domain.loadProfiles();
});

const profiles = computed(() =>
  [...domain.profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);
const activeProfileId = computed(() => domain.activeProfileId);

const theme = computed({
  get: () => ui.theme,
  set: (value) => ui.setTheme(value),
});

async function submitProfile() {
  if (!profileName.value || !profileStartingMonth.value) return;
  await domain.createProfile({
    name: profileName.value.trim(),
    currencyCode: profileCurrency.value.trim() || 'USD',
    startingMonth: profileStartingMonth.value,
  });
  profileName.value = '';
  profileStartingMonth.value = '';
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Settings</h2>
    <p class="view-subtitle mb-4">
      Manage profiles, currency, and appearance preferences.
    </p>

    <div class="row g-3">
      <div class="col-12">
        <section v-if="profiles.length" class="card card-list stacked-section h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Existing profiles</h3>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                data-bs-toggle="modal"
                data-bs-target="#createProfileModal"
              >
                New profile
              </button>
            </div>
            <ul class="list-unstyled mt-3">
              <li
                v-for="p in profiles"
                :key="p.id"
                class="mb-2"
              >
                <div class="d-flex flex-column border rounded p-2 bg-dark bg-opacity-50">
                  <div class="d-flex align-items-center mb-1">
                    <span class="fw-semibold me-2">{{ p.name }}</span>
                    <span
                      v-if="p.id === activeProfileId"
                      class="badge bg-success"
                    >
                      Active
                    </span>
                  </div>
                  <div class="small text-muted d-flex flex-wrap gap-2">
                    <span>{{ p.currencyCode }}</span>
                    <span>From {{ p.startingMonth }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <div class="row g-3 mt-3">
      <div class="col-12">
        <section class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title mb-3">Appearance</h3>
            <div class="mb-3">
              <label class="form-label">
                Theme
                <select v-model="theme" class="form-select">
                  <option value="system">System default</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
            <p class="small text-muted mb-0">
              Theme changes update the app's background, cards, and text colors to keep everything readable.
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="createProfileModal"
    tabindex="-1"
    aria-labelledby="createProfileModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createProfileModalLabel">Create profile</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submitProfile">
          <div class="modal-body row g-3">
            <div class="col-12">
              <label class="form-label">
                Profile name
                <input
                  v-model="profileName"
                  type="text"
                  class="form-control"
                  placeholder="Personal profile"
                />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Currency
                <input v-model="profileCurrency" type="text" class="form-control" placeholder="USD" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Starting month
                <input v-model="profileStartingMonth" type="month" class="form-control" />
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button class="btn btn-success" type="submit">
              Save profile
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

