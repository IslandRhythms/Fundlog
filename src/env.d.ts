/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  fundlog: {
    theme: {
      get(): Promise<'light' | 'dark' | 'system'>;
      set(theme: 'light' | 'dark' | 'system'): Promise<'light' | 'dark' | 'system'>;
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
    transaction: {
      listByBudget(
        profileId: number,
        budgetId: number | null
      ): Promise<import('./shared/types').Transaction[]>;
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
      }): Promise<import('./shared/types').Goal>;
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

