<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from './stores/ui';
import logoAndTitleUrl from './assets/logo-and-title.png';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

type NavItem = { path: string; label: string };
type NavSection = { heading: string; items: NavItem[] };

/** Task flow: overview → day-to-day → budget work → longer-term planning → cards; settings last. */
const navSections: NavSection[] = [
  { heading: 'Overview', items: [{ path: '/dashboard', label: 'Dashboard' }] },
  { heading: 'Activity', items: [{ path: '/transactions', label: 'Transactions' }] },
  {
    heading: 'Budgets',
    items: [
      { path: '/budgets', label: 'Budgets' },
      { path: '/budget-records', label: 'Budget Records' },
    ],
  },
  {
    heading: 'Planning',
    items: [
      { path: '/goals', label: 'Goals' },
      { path: '/expenses', label: 'Expenses' },
    ],
  },
  { heading: 'Credit', items: [{ path: '/cards', label: 'Cards' }] },
];

const settingsNav: NavItem = { path: '/settings', label: 'Settings' };

function go(path: string) {
  router.push(path);
}

function navItemActive(path: string) {
  return route.path === path;
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
          <router-view />
        </section>
      </main>
    </div>
  </div>
</template>
