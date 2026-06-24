import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import DashboardView from './views/DashboardView.vue';
import BudgetsView from './views/BudgetsView.vue';
import TransactionsView from './views/TransactionsView.vue';
import GoalsView from './views/GoalsView.vue';
import SettingsView from './views/SettingsView.vue';
import ExpensesView from './views/ExpensesView.vue';
import ExtraIncomeView from './views/ExtraIncomeView.vue';
import CardsView from './views/CardsView.vue';
import BudgetRecordsView from './views/BudgetRecordsView.vue';
import BudgetHistoryView from './views/BudgetHistoryView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView },
  { path: '/budgets', component: BudgetsView },
  { path: '/budget-records', component: BudgetRecordsView },
  { path: '/budget-history', component: BudgetHistoryView },
  { path: '/transactions', component: TransactionsView },
  { path: '/goals', component: GoalsView },
  { path: '/expenses', component: ExpensesView },
  { path: '/extra-income', component: ExtraIncomeView },
  { path: '/import-export', redirect: '/transactions' },
  { path: '/settings', component: SettingsView },
  { path: '/cards', component: CardsView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

