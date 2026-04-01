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
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-circle">F</div>
        <div class="brand">
          <div class="brand-name">Fundlog</div>
          <div class="brand-subtitle">Personal budgeting</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          type="button"
          @click="go(item.path)"
        >
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <button
          type="button"
          class="theme-toggle"
          @click="ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')"
        >
          <span v-if="ui.theme === 'dark'">Switch to light</span>
          <span v-else>Switch to dark</span>
        </button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-title">
          <h1>Fundlog</h1>
          <p>Multi-budget planning, receipts, and goals.</p>
        </div>
        <div class="topbar-actions">
          <button type="button" class="primary-button">
            New transaction
          </button>
        </div>
      </header>
      <section class="main-content">
        <router-view />
      </section>
    </main>
  </div>
</template>
