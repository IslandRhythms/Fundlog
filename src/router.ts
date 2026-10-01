import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import DashboardView from './views/DashboardView.vue';
import BudgetsView from './views/BudgetsView.vue';
import TransactionsView from './views/TransactionsView.vue';
import GoalsView from './views/GoalsView.vue';
import SettingsView from './views/SettingsView.vue';
import ExpensesView from './views/ExpensesView.vue';
import CardsView from './views/CardsView.vue';
import BudgetRecordsView from './views/BudgetRecordsView.vue';
import PortfolioSnapshotView from './views/PortfolioSnapshotView.vue';
import MilestonesView from './views/MilestonesView.vue';
import RetirementCalculatorView from './views/RetirementCalculatorView.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: DashboardView },
  { path: '/budgets', component: BudgetsView },
  { path: '/budget-records', component: BudgetRecordsView },
  { path: '/budget-history', redirect: { path: '/budget-records', query: { tab: 'history' } } },
  { path: '/transactions', component: TransactionsView },
  { path: '/goals', component: GoalsView },
  { path: '/expenses', component: ExpensesView },
  { path: '/extra-income', redirect: { path: '/budgets', query: { extraIncome: '1' } } },
  { path: '/portfolio-snapshot', component: PortfolioSnapshotView },
  { path: '/milestones', component: MilestonesView },
  { path: '/retirement', component: RetirementCalculatorView },
  { path: '/import-export', redirect: '/transactions' },
  { path: '/settings', component: SettingsView },
  { path: '/cards', component: CardsView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

