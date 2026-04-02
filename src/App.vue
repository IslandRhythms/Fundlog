<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from './stores/ui';

const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/budgets', label: 'Budgets' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/goals', label: 'Goals' },
  { path: '/expenses', label: 'Expenses' },
  { path: '/import-export', label: 'Import / Export' },
  { path: '/settings', label: 'Settings' },
];

onMounted(() => {
  ui.initTheme();
});

function go(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="app-shell container-fluid">
    <div class="row flex-lg-nowrap">
      <aside class="sidebar col-auto d-flex flex-column">
        <div class="sidebar-header d-flex align-items-center mb-3">
          <div class="logo-circle me-2">F</div>
          <div class="brand">
            <div class="brand-name">Fundlog</div>
            <div class="brand-subtitle">Personal budgeting</div>
          </div>
        </div>
        <nav class="sidebar-nav nav nav-pills flex-column mb-auto">
          <button
            v-for="item in navItems"
            :key="item.path"
            class="nav-item btn btn-link text-start text-decoration-none"
            :class="{ active: route.path === item.path }"
            type="button"
            @click="go(item.path)"
          >
            <span>{{ item.label }}</span>
          </button>
        </nav>
        <div class="sidebar-footer mt-auto">
          <button
            type="button"
            class="theme-toggle btn btn-outline-light w-100"
            @click="ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')"
          >
            <span v-if="ui.theme === 'dark'">Switch to light</span>
            <span v-else>Switch to dark</span>
          </button>
        </div>
      </aside>
      <main class="main col px-3 py-3">
        <header class="topbar d-flex justify-content-between align-items-center mb-3 card p-3">
          <div class="topbar-title">
            <h1 class="h4 mb-1">Fundlog</h1>
            <p class="mb-0 text-muted">
              Multi-budget planning, receipts, and goals.
            </p>
          </div>
        </header>
        <section class="main-content">
          <router-view />
        </section>
      </main>
    </div>
  </div>
</template>
