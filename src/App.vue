<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import ConfirmDialog from './components/ConfirmDialog.vue';
import { useUiStore } from './stores/ui';
import logoAndTitleUrl from './assets/logo-and-title.png';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const backupExporting = ref(false);

type NavItem = { path: string; label: string };
type NavSection = { heading: string; items: NavItem[] };

/** Task flow: overview → day-to-day → budget work → longer-term planning → finances; settings last. */
const navSections: NavSection[] = [
  { heading: 'Overview', items: [{ path: '/dashboard', label: 'Dashboard' }] },
  { heading: 'Activity', items: [{ path: '/transactions', label: 'Transactions' }] },
  {
    heading: 'Budgets',
    items: [
      { path: '/budgets', label: 'Budgets' },
      { path: '/budget-records', label: 'Budget Records' },
      { path: '/budget-history', label: 'Budget History' },
    ],
  },
  {
    heading: 'Planning',
    items: [
      { path: '/goals', label: 'Goals' },
      { path: '/expenses', label: 'Expenses' },
      { path: '/extra-income', label: 'Extra income' },
    ],
  },
  {
    heading: 'Finances',
    items: [
      { path: '/portfolio-snapshot', label: 'Portfolio Snapshot' },
      { path: '/cards', label: 'Cards' },
    ],
  },
];

const settingsNav: NavItem = { path: '/settings', label: 'Settings' };

function go(path: string) {
  router.push(path);
}

function navItemActive(path: string) {
  return route.path === path;
}

async function exportBackupNow() {
  backupExporting.value = true;
  try {
    const result = await window.fundlog.database.exportCopy();
    if (result.ok) {
      toast.success(`Database exported to ${result.path}`);
      await ui.refreshLastBackupAt();
    } else if ('error' in result && result.error) {
      toast.error(result.error);
    }
  } finally {
    backupExporting.value = false;
  }
}
</script>

<template>
  <div class="app-shell container-fluid">
    <div class="row flex-lg-nowrap g-0 sidebar-layout-row">
      <aside class="sidebar col-auto d-flex flex-column">
        <div class="sidebar-header sidebar-header--brand mb-3">
          <img
            :src="logoAndTitleUrl"
            alt="Fundlog"
            class="sidebar-brand-image"
            decoding="async"
          />
        </div>
        <nav class="sidebar-nav nav nav-pills flex-column" aria-label="Main">
          <div
            v-for="(section, si) in navSections"
            :key="section.heading"
            class="sidebar-nav-section"
            :class="{ 'sidebar-nav-section--first': si === 0 }"
          >
            <p class="sidebar-nav-heading">{{ section.heading }}</p>
            <button
              v-for="item in section.items"
              :key="item.path"
              class="nav-item btn btn-link text-start text-decoration-none"
              :class="{ active: navItemActive(item.path) }"
              type="button"
              @click="go(item.path)"
            >
              <span>{{ item.label }}</span>
            </button>
          </div>
        </nav>
        <div class="sidebar-bottom-card">
          <p class="sidebar-nav-heading sidebar-bottom-card__title">App</p>
          <button
            type="button"
            class="sidebar-settings-btn"
            :class="{ 'sidebar-settings-btn--active': navItemActive(settingsNav.path) }"
            :aria-current="navItemActive(settingsNav.path) ? 'page' : undefined"
            @click="go(settingsNav.path)"
          >
            <svg
              class="sidebar-settings-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
            <span>{{ settingsNav.label }}</span>
          </button>
          <button
            type="button"
            class="theme-toggle"
            :aria-label="
              ui.resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            "
            @click="ui.setTheme(ui.resolvedTheme === 'dark' ? 'light' : 'dark')"
          >
            <span class="theme-toggle-icon" aria-hidden="true">
              {{ ui.resolvedTheme === 'dark' ? '☀' : '☾' }}
            </span>
            <span v-if="ui.resolvedTheme === 'dark'">Light mode</span>
            <span v-else>Dark mode</span>
          </button>
        </div>
      </aside>
      <main class="main col">
        <section class="main-content">
          <div
            v-if="ui.backupOverdue"
            class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
            role="status"
          >
            <span class="small mb-0">
              Database backup is due. Export a copy to keep your data safe.
            </span>
            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-sm btn-warning"
                :disabled="backupExporting"
                @click="exportBackupNow"
              >
                {{ backupExporting ? 'Exporting…' : 'Export now' }}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                @click="ui.dismissBackupBanner()"
              >
                Dismiss
              </button>
            </div>
          </div>
          <router-view />
        </section>
      </main>
    </div>
  </div>
  <ConfirmDialog />
</template>
