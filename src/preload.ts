import { contextBridge, ipcRenderer } from 'electron';
import type {
  Profile,
  Budget,
  Transaction,
  Goal,
  Receipt,
  BudgetCategory,
  BudgetSubcategory,
} from './shared/types';

type Theme = 'light' | 'dark' | 'system';

export const api = {
  theme: {
    get: async (): Promise<Theme> => {
      return ipcRenderer.invoke('theme:get');
    },
    set: async (theme: Theme): Promise<Theme> => {
      return ipcRenderer.invoke('theme:set', theme);
    },
  },
  profile: {
    list: async (): Promise<Profile[]> => ipcRenderer.invoke('profile:list'),
    create: async (input: {
      name: string;
      currencyCode: string;
      startingMonth: string;
    }): Promise<Profile> => ipcRenderer.invoke('profile:create', input),
  },
  budget: {
    listByProfile: async (profileId: number): Promise<Budget[]> =>
      ipcRenderer.invoke('budget:listByProfile', { profileId }),
    create: async (input: {
      profileId: number;
      name: string;
      startMonth: string;
      monthlyIncome: number;
      ruleSet: string;
    }): Promise<Budget> => ipcRenderer.invoke('budget:create', input),
  },
  category: {
    listByBudget: async (
      budgetId: number,
    ): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('category:listByBudget', { budgetId }),
    updateColor: async (input: {
      id: number;
      color: string;
      budgetId: number;
    }): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('category:updateColor', input),
  },
  subcategory: {
    create: async (input: {
      budgetId: number;
      parentCategoryId: number | null;
      label: string;
      targetPercent?: number | null;
      targetAmount?: number | null;
      isFlexible: boolean;
      sortOrder?: number;
    }): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('subcategory:create', input),
  },
  transaction: {
    listByBudget: async (
      profileId: number,
      budgetId: number | null,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listByBudget', { profileId, budgetId }),
    listUnexpected: async (
      profileId: number,
      budgetId: number,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listUnexpected', { profileId, budgetId }),
    createManual: async (input: {
      profileId: number;
      budgetId: number;
      subcategoryId: number | null;
      date: string;
      amount: number;
      description?: string | null;
    }): Promise<Transaction> => ipcRenderer.invoke('transaction:createManual', input),
  },
  goal: {
    listByProfile: async (profileId: number): Promise<Goal[]> =>
      ipcRenderer.invoke('goal:listByProfile', { profileId }),
    create: async (input: {
      profileId: number;
      name: string;
      targetAmount: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
    }): Promise<Goal> => ipcRenderer.invoke('goal:create', input),
  },
  csv: {
    importTransactions: async (input: {
      profileId: number;
      budgetId: number | null;
      rows: {
        date: string;
        amount: number;
        merchant?: string | null;
        description?: string | null;
      }[];
    }): Promise<Transaction[]> =>
      ipcRenderer.invoke('csv:importTransactions', input),
    exportTransactions: async (input: {
      profileId: number;
      budgetId: number | null;
    }): Promise<{ filename: string; csv: string; count: number }> =>
      ipcRenderer.invoke('csv:exportTransactions', input),
  },
  receipt: {
    listByTransaction: async (transactionId: number): Promise<Receipt[]> =>
      ipcRenderer.invoke('receipt:listByTransaction', { transactionId }),
    attachViaDialog: async (input: {
      transactionId: number | null;
      expectedAmount?: number | null;
      merchant?: string | null;
    }): Promise<Receipt | null> =>
      ipcRenderer.invoke('receipt:attachViaDialog', input),
    runFakeOcr: async (input: {
      receiptId: number;
      transactionAmount: number | null;
      transactionDate: string | null;
      transactionMerchant: string | null;
    }): Promise<Receipt> => ipcRenderer.invoke('receipt:runFakeOcr', input),
  },
};

declare global {
  interface Window {
    fundlog: typeof api;
  }
}

contextBridge.exposeInMainWorld('fundlog', api);

