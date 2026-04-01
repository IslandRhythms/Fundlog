import { defineStore } from 'pinia';
import type { Profile, Budget, Transaction, Goal } from '../shared/types';

export const useDomainStore = defineStore('domain', {
  state: () => ({
    profiles: [] as Profile[],
    budgets: [] as Budget[],
    transactions: [] as Transaction[],
    goals: [] as Goal[],
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
        toast.error('Failed to load profiles. Please try again.');
      }
    },
    async createProfile(input: {
      name: string;
      currencyCode: string;
      startingMonth: string;
    }) {
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const profile = await window.fundlog.profile.create(input);
        this.profiles.push(profile);
        this.activeProfileId = profile.id;
        await this.loadBudgets();
        toast.success('Profile created.');
      } catch (err) {
        console.error(err);
        toast.error('Failed to create profile.');
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
      } catch (err) {
        console.error(err);
        toast.error('Failed to load budgets.');
      }
    },
    async createBudget(input: {
      name: string;
      startMonth: string;
      monthlyIncome: number;
      ruleSet: string;
    }) {
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
        toast.success('Budget created.');
      } catch (err) {
        console.error(err);
        toast.error('Failed to create budget.');
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
        toast.error('Failed to load transactions.');
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
        toast.error('Failed to load goals.');
      }
    },
    async createGoal(input: {
      name: string;
      targetAmount: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
    }) {
      if (!this.activeProfileId) return;
      const { useToast } = await import('vue-toastification');
      const toast = useToast();
      try {
        const goal = await window.fundlog.goal.create({
          profileId: this.activeProfileId,
          ...input,
        });
        this.goals.push(goal);
        toast.success('Goal created.');
      } catch (err) {
        console.error(err);
        toast.error('Failed to create goal.');
      }
    },
  },
});

