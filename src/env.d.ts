/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  fundlog: {
    database: {
      getLocation(): Promise<{
        resolvedPath: string;
        customPath: string | null;
        envOverride: boolean;
      }>;
      pickPathSave(): Promise<string | null>;
      pickPathOpen(): Promise<string | null>;
      setLocation(filePath: string | null): Promise<
        { ok: true } | { ok: false; error: string }
      >;
      exportCopy(): Promise<
        | { ok: true; path: string }
        | { ok: false; canceled: true }
        | { ok: false; error: string }
      >;
    };
    theme: {
      getState(): Promise<{
        preference: 'light' | 'dark' | 'system';
        resolved: 'light' | 'dark';
      }>;
      set(theme: 'light' | 'dark' | 'system'): Promise<'light' | 'dark'>;
    };
    preferences: {
      get(): Promise<import('./shared/types').AppPrefs>;
      set(patch: Partial<import('./shared/types').AppPrefs>): Promise<import('./shared/types').AppPrefs>;
    };
    profile: {
      list(): Promise<import('./shared/types').Profile[]>;
      create(input: {
        name: string;
        currencyCode: string;
        startingMonth: string;
      }): Promise<import('./shared/types').Profile>;
    };
    budget: {
      listByProfile(profileId: number): Promise<import('./shared/types').Budget[]>;
      create(input: {
        profileId: number;
        name: string;
        startMonth: string;
        monthlyIncome: number;
        ruleSet: string;
      }): Promise<import('./shared/types').Budget>;
    };
    budgetIncomeBoost: {
      listByProfile(profileId: number): Promise<import('./shared/types').BudgetMonthIncomeBoost[]>;
      create(input: {
        budgetId: number;
        month: string;
        amount: number;
        label?: string | null;
      }): Promise<import('./shared/types').BudgetMonthIncomeBoost>;
      delete(id: number): Promise<void>;
    };
    category: {
      listByBudget(budgetId: number): Promise<{
        categories: import('./shared/types').BudgetCategory[];
        subcategories: import('./shared/types').BudgetSubcategory[];
      }>;
      updateColor(input: {
        id: number;
        color: string;
        budgetId: number;
      }): Promise<{
        categories: import('./shared/types').BudgetCategory[];
        subcategories: import('./shared/types').BudgetSubcategory[];
      }>;
    };
    subcategory: {
      create(input: {
        budgetId: number;
        parentCategoryId: number | null;
        label: string;
        targetPercent?: number | null;
        targetAmount?: number | null;
        minAmount?: number | null;
        maxAmount?: number | null;
        isFlexible: boolean;
        spreadMonths?: number;
        spreadStartMonth?: string | null;
        sortOrder?: number;
      }): Promise<{
        categories: import('./shared/types').BudgetCategory[];
        subcategories: import('./shared/types').BudgetSubcategory[];
      }>;
      update(input: {
        id: number;
        budgetId: number;
        label: string;
        targetPercent?: number | null;
        targetAmount?: number | null;
        minAmount?: number | null;
        maxAmount?: number | null;
        isFlexible: boolean;
        spreadMonths?: number;
        spreadStartMonth?: string | null;
      }): Promise<{
        categories: import('./shared/types').BudgetCategory[];
        subcategories: import('./shared/types').BudgetSubcategory[];
      }>;
      delete(input: {
        id: number;
        budgetId: number;
      }): Promise<{
        categories: import('./shared/types').BudgetCategory[];
        subcategories: import('./shared/types').BudgetSubcategory[];
      }>;
    };
    transaction: {
      listByBudget(
        profileId: number,
        budgetId: number | null
      ): Promise<import('./shared/types').Transaction[]>;
      listUnexpected(
        profileId: number,
        budgetId: number
      ): Promise<import('./shared/types').Transaction[]>;
      listPurchases(
        profileId: number,
        budgetId: number
      ): Promise<import('./shared/types').Transaction[]>;
      listGoalContributions(
        profileId: number,
        budgetId: number
      ): Promise<import('./shared/types').Transaction[]>;
      createManual(input: {
        profileId: number;
        budgetId: number;
        subcategoryId: number | null;
        date: string;
        amount: number;
        description?: string | null;
        merchant?: string | null;
        goalId?: number | null;
        spreadMonths?: number;
        entryKind?: 'purchase' | 'unexpected' | null;
      }): Promise<import('./shared/types').Transaction>;
      createSingle(input: {
        profileId: number;
        budgetId: number;
        date: string;
        amount: number;
        merchant?: string | null;
        description?: string | null;
      }): Promise<import('./shared/types').Transaction>;
      spendSummaryForBudget(
        budgetId: number,
      ): Promise<{ totalAmount: number; count: number }>;
      clearForBudgetMonth(
        budgetId: number,
        month: string,
      ): Promise<{ deleted: number }>;
    };
    card: {
      listByProfile(profileId: number): Promise<import('./shared/types').CreditCard[]>;
      create(input: {
        profileId: number;
        name: string;
        issuer?: string | null;
        lastFour?: string | null;
        network?: string | null;
        annualFee?: number | null;
        benefitsNotes?: string | null;
      }): Promise<import('./shared/types').CreditCard>;
      update(input: {
        id: number;
        name: string;
        issuer?: string | null;
        lastFour?: string | null;
        network?: string | null;
        annualFee?: number | null;
        benefitsNotes?: string | null;
      }): Promise<import('./shared/types').CreditCard>;
      delete(id: number): Promise<void>;
      perkCreate(input: {
        cardId: number;
        label: string;
        categoryTags?: string | null;
        cashbackDetail: string;
        sortOrder?: number;
      }): Promise<import('./shared/types').CreditCard>;
      perkUpdate(input: {
        id: number;
        label: string;
        categoryTags?: string | null;
        cashbackDetail: string;
        sortOrder?: number;
      }): Promise<import('./shared/types').CreditCard>;
      perkDelete(perkId: number): Promise<void>;
      setActivePerk(args: {
        cardId: number;
        perkId: number | null;
      }): Promise<import('./shared/types').CreditCard>;
    };
    goal: {
      listByProfile(profileId: number): Promise<import('./shared/types').Goal[]>;
      create(input: {
        profileId: number;
        name: string;
        targetAmount: number;
        targetDate?: string | null;
        priority?: number;
        note?: string | null;
        showOnDashboard?: boolean;
      }): Promise<import('./shared/types').Goal>;
      update(input: {
        id: number;
        name?: string;
        targetAmount?: number;
        targetDate?: string | null;
        priority?: number;
        note?: string | null;
        showOnDashboard?: boolean;
      }): Promise<import('./shared/types').Goal>;
      delete(input: { id: number; profileId: number }): Promise<void>;
    };
    goalAllocation: {
      listByProfile(
        profileId: number,
      ): Promise<import('./shared/types').GoalAllocation[]>;
      setForGoal(input: {
        goalId: number;
        profileId: number;
        items: { subcategoryId: number; percent: number | null }[];
      }): Promise<void>;
    };
    csv: {
      importTransactions(input: {
        profileId: number;
        budgetId: number | null;
        rows: {
          date: string;
          amount: number;
          merchant?: string | null;
          description?: string | null;
        }[];
      }): Promise<import('./shared/types').Transaction[]>;
      exportTransactions(input: {
        profileId: number;
        budgetId: number | null;
      }): Promise<{ filename: string; csv: string; count: number }>;
    };
    receipt: {
      listByTransaction(
        transactionId: number
      ): Promise<import('./shared/types').Receipt[]>;
      attachViaDialog(input: {
        transactionId: number | null;
        expectedAmount?: number | null;
        merchant?: string | null;
      }): Promise<import('./shared/types').Receipt | null>;
      runFakeOcr(input: {
        receiptId: number;
        transactionAmount: number | null;
        transactionDate: string | null;
        transactionMerchant: string | null;
      }): Promise<import('./shared/types').Receipt>;
    };
  };
}

declare module 'bootstrap';
