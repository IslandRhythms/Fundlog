import { defineStore } from 'pinia';
import type {
  Profile,
  Budget,
  BudgetMonthIncomeBoost,
  Transaction,
  Goal,
} from '../shared/types';
import { errorMessageFromUnknown } from '../shared/errors';

export const useDomainStore = defineStore('domain', {
  state: () => ({
    profiles: [] as Profile[],
    budgets: [] as Budget[],
    transactions: [] as Transaction[],
    goals: [] as Goal[],
    budgetIncomeBoosts: [] as BudgetMonthIncomeBoost[],
    activeProfileId: null as number | null,
    activeBudgetId: null as number | null,
  }),
  getters: {
    activeProfile(state): Profile | undefined {
      return state.profiles.find((p) => p.id === state.activeProfileId);
    },
    activeBudget(state): Budget | undefined {
      return state.budgets.find((b) => b.id === state.activeBudgetId);
    },
  },
  actions: {
    async loadProfiles() {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const profiles = await window.fundlog.profile.list();
        this.profiles = profiles;
        if (!this.activeProfileId && profiles.length) {
          this.activeProfileId = profiles[0].id;
          await this.loadBudgets();
        }
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to load profiles.'));
      }
    },
    async createProfile(input: {
      name: string;
      currencyCode: string;
      startingMonth: string;
    }): Promise<boolean> {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const profile = await window.fundlog.profile.create(input);
        this.profiles.push(profile);
        this.activeProfileId = profile.id;
        await this.loadBudgets();
        toast.success('Profile created.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to create profile.'));
        return false;
      }
    },
    async loadBudgets() {
      if (!this.activeProfileId) return;
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const budgets = await window.fundlog.budget.listByProfile(this.activeProfileId);
        this.budgets = budgets;
        if (!this.activeBudgetId && budgets.length) {
          this.activeBudgetId =
            budgets.find((b: Budget) => b.isActive)?.id ?? budgets[0].id;
        }
        await this.loadTransactions();
        await this.loadBudgetIncomeBoosts();
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to load budgets.'));
      }
    },
    async createBudget(input: {
      name: string;
      startMonth: string;
      monthlyIncome: number;
      ruleSet: string;
    }): Promise<boolean> {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        if (!this.activeProfileId) {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const startingMonth = `${year}-${month}`;
          const defaultProfile = await window.fundlog.profile.create({
            name: 'Default profile',
            currencyCode: 'USD',
            startingMonth,
          });
          this.profiles.push(defaultProfile);
          this.activeProfileId = defaultProfile.id;
        }

        const budget = await window.fundlog.budget.create({
          profileId: this.activeProfileId,
          ...input,
        });
        this.budgets.unshift(budget);
        this.activeBudgetId = budget.id;
        await this.loadTransactions();
        await this.loadBudgetIncomeBoosts();
        toast.success('Budget created.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to create budget.'));
        return false;
      }
    },
    async loadBudgetIncomeBoosts() {
      if (!this.activeProfileId) {
        this.budgetIncomeBoosts = [];
        return;
      }
      try {
        this.budgetIncomeBoosts = await window.fundlog.budgetIncomeBoost.listByProfile(
          this.activeProfileId,
        );
      } catch (err) {
        console.error(err);
        this.budgetIncomeBoosts = [];
      }
    },
    incomeBoostSumForBudgetMonth(budgetId: number, month: string): number {
      return this.budgetIncomeBoosts
        .filter(
          (r: BudgetMonthIncomeBoost) =>
            r.budgetId === budgetId && r.month === month,
        )
        .reduce((s: number, r: BudgetMonthIncomeBoost) => s + r.amount, 0);
    },
    effectiveMonthlyIncomeFor(budgetId: number, month: string): number {
      const b = this.budgets.find((x: Budget) => x.id === budgetId);
      const base = b?.monthlyIncome ?? 0;
      return base + this.incomeBoostSumForBudgetMonth(budgetId, month);
    },
    async createIncomeBoost(input: {
      budgetId: number;
      month: string;
      amount: number;
      label?: string | null;
    }): Promise<boolean> {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        await window.fundlog.budgetIncomeBoost.create(input);
        await this.loadBudgetIncomeBoosts();
        toast.success('Extra income added for that month.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Could not add extra income.'));
        return false;
      }
    },
    async deleteIncomeBoost(id: number): Promise<boolean> {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        await window.fundlog.budgetIncomeBoost.delete(id);
        await this.loadBudgetIncomeBoosts();
        toast.success('Entry removed.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Could not remove entry.'));
        return false;
      }
    },
    async loadTransactions() {
      if (!this.activeProfileId) return;
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const tx = await window.fundlog.transaction.listByBudget(
          this.activeProfileId,
          this.activeBudgetId ?? null
        );
        this.transactions = tx;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to load transactions.'));
      }
    },
    async loadGoals() {
      if (!this.activeProfileId) return;
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const goals = await window.fundlog.goal.listByProfile(this.activeProfileId);
        this.goals = goals;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to load goals.'));
      }
    },
    async createGoal(input: {
      name: string;
      targetAmount: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
      showOnDashboard?: boolean;
    }): Promise<boolean> {
      if (!this.activeProfileId) return false;
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const goal = await window.fundlog.goal.create({
          profileId: this.activeProfileId,
          ...input,
        });
        this.goals.unshift(goal);
        toast.success('Goal created.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to create goal.'));
        return false;
      }
    },
    async updateGoal(input: {
      id: number;
      name?: string;
      targetAmount?: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
      showOnDashboard?: boolean;
    }): Promise<boolean> {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const updated = await window.fundlog.goal.update(input);
        const i = this.goals.findIndex((g: Goal) => g.id === updated.id);
        if (i >= 0) this.goals[i] = updated;
        toast.success('Goal updated.');
        return true;
      } catch (err) {
        console.error(err);
        toast.error(errorMessageFromUnknown(err, 'Failed to update goal.'));
        return false;
      }
    },
  },
});

