<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';

const domain = useDomainStore();

const profileName = ref('');
const profileCurrency = ref('USD');
const profileStartingMonth = ref('');

onMounted(async () => {
  await domain.loadProfiles();
});

const profiles = computed(() => domain.profiles);
const activeProfileId = computed(() => domain.activeProfileId);

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
  <div class="view">
    <h2>Settings</h2>
    <p class="view-subtitle">
      Manage profiles, currency, and appearance preferences.
    </p>

    <div class="card-grid">
      <div class="card card-form">
        <h3>Profiles</h3>
        <p class="view-intro">
          Create a profile to group your budgets, currency, and goals.
        </p>
        <form class="form-grid" @submit.prevent="submitProfile">
          <label>
            <span>Profile name</span>
            <input
              v-model="profileName"
              type="text"
              placeholder="Personal profile"
            />
          </label>
          <label>
            <span>Currency</span>
            <input v-model="profileCurrency" type="text" placeholder="USD" />
          </label>
          <label>
            <span>Starting month</span>
            <input v-model="profileStartingMonth" type="month" />
          </label>
          <div></div>
          <button class="primary-button" type="submit">
            Save profile
          </button>
        </form>
        <div v-if="profiles.length" class="goal-list" style="margin-top: 16px">
          <h4>Existing profiles</h4>
          <ul class="goal-list">
            <li
              v-for="p in profiles"
              :key="p.id"
              class="goal-row"
            >
              <div class="goal-title">
                {{ p.name }}
                <span
                  v-if="p.id === activeProfileId"
                  class="badge"
                >
                  Active
                </span>
              </div>
              <div class="goal-meta">
                <span>{{ p.currencyCode }}</span>
                <span>From {{ p.startingMonth }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

