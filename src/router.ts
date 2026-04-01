import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import DashboardView from './views/DashboardView.vue';
import BudgetsView from './views/BudgetsView.vue';
import TransactionsView from './views/TransactionsView.vue';
import GoalsView from './views/GoalsView.vue';
import ImportExportView from './views/ImportExportView.vue';
import SettingsView from './views/SettingsView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView },
  { path: '/budgets', component: BudgetsView },
  { path: '/transactions', component: TransactionsView },
  { path: '/goals', component: GoalsView },
  { path: '/import-export', component: ImportExportView },
  { path: '/settings', component: SettingsView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

