import { contextBridge, ipcRenderer } from 'electron';
import type {
  Profile,
  Budget,
  BudgetMonthIncomeBoost,
  Transaction,
  Goal,
  GoalAllocation,
  Receipt,
  BudgetCategory,
  BudgetSubcategory,
  CreditCard,
  PortfolioAccount,
  AppPrefs,
} from './shared/types';

type Theme = 'light' | 'dark' | 'system';

export type DatabaseLocationInfo = {
  resolvedPath: string;
  customPath: string | null;
  envOverride: boolean;
};

export const api = {
  database: {
    getLocation: async (): Promise<DatabaseLocationInfo> =>
      ipcRenderer.invoke('database:getLocation'),
    pickPathSave: async (): Promise<string | null> =>
      ipcRenderer.invoke('database:pickPathSave'),
    pickPathOpen: async (): Promise<string | null> =>
      ipcRenderer.invoke('database:pickPathOpen'),
    setLocation: async (
      filePath: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> =>
      ipcRenderer.invoke('database:setLocation', { filePath }),
    exportCopy: async (): Promise<
      | { ok: true; path: string }
      | { ok: false; canceled: true }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('database:exportCopy'),
  },
  theme: {
    getState: async (): Promise<{
      preference: Theme;
      resolved: 'light' | 'dark';
    }> => ipcRenderer.invoke('theme:getState'),
    set: async (theme: Theme): Promise<'light' | 'dark'> => {
      return ipcRenderer.invoke('theme:set', theme);
    },
  },
  preferences: {
    get: async (): Promise<AppPrefs> => ipcRenderer.invoke('preferences:get'),
    set: async (patch: Partial<AppPrefs>): Promise<AppPrefs> =>
      ipcRenderer.invoke('preferences:set', patch),
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
  budgetIncomeBoost: {
    listByProfile: async (profileId: number): Promise<BudgetMonthIncomeBoost[]> =>
      ipcRenderer.invoke('budgetIncomeBoost:listByProfile', { profileId }),
    create: async (input: {
      budgetId: number;
      month: string;
      amount: number;
      label?: string | null;
    }): Promise<BudgetMonthIncomeBoost> =>
      ipcRenderer.invoke('budgetIncomeBoost:create', input),
    delete: async (id: number): Promise<void> =>
      ipcRenderer.invoke('budgetIncomeBoost:delete', { id }),
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
      minAmount?: number | null;
      maxAmount?: number | null;
      isFlexible: boolean;
      spreadMonths?: number;
      spreadStartMonth?: string | null;
      dueDay?: number | null;
      nextDueDate?: string | null;
      sortOrder?: number;
    }): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('subcategory:create', input),
    update: async (input: {
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
      dueDay?: number | null;
      nextDueDate?: string | null;
    }): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('subcategory:update', input),
    delete: async (input: {
      id: number;
      budgetId: number;
    }): Promise<{ categories: BudgetCategory[]; subcategories: BudgetSubcategory[] }> =>
      ipcRenderer.invoke('subcategory:delete', input),
  },
  transaction: {
    listByBudget: async (
      profileId: number,
      budgetId: number | null,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listByBudget', { profileId, budgetId }),
    listByBudgetPage: async (input: {
      profileId: number;
      budgetId: number | null;
      limit?: number;
      offset?: number;
      q?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      subcategoryId?: number | null;
    }): Promise<{ rows: Transaction[]; total: number }> =>
      ipcRenderer.invoke('transaction:listByBudgetPage', input),
    listUnexpected: async (
      profileId: number,
      budgetId: number,
      month?: string | null,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listUnexpected', {
        profileId,
        budgetId,
        month,
      }),
    listPurchases: async (
      profileId: number,
      budgetId: number,
      month?: string | null,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listPurchases', {
        profileId,
        budgetId,
        month,
      }),
    listGoalContributions: async (
      profileId: number,
      budgetId: number,
      month?: string | null,
    ): Promise<Transaction[]> =>
      ipcRenderer.invoke('transaction:listGoalContributions', {
        profileId,
        budgetId,
        month,
      }),
    createManual: async (input: {
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
    }): Promise<Transaction> => ipcRenderer.invoke('transaction:createManual', input),
    createSingle: async (input: {
      profileId: number;
      budgetId: number;
      date: string;
      amount: number;
      merchant?: string | null;
      description?: string | null;
    }): Promise<Transaction> => ipcRenderer.invoke('transaction:createSingle', input),
    spendSummaryForBudget: async (
      budgetId: number,
    ): Promise<{ totalAmount: number; count: number }> =>
      ipcRenderer.invoke('transaction:spendSummaryForBudget', { budgetId }),
    clearForBudgetMonth: async (
      budgetId: number,
      month: string,
    ): Promise<{ deleted: number }> =>
      ipcRenderer.invoke('transaction:clearForBudgetMonth', { budgetId, month }),
    delete: async (input: {
      id: number;
      profileId: number;
    }): Promise<void> => ipcRenderer.invoke('transaction:delete', input),
  },
  card: {
    listByProfile: async (profileId: number): Promise<CreditCard[]> =>
      ipcRenderer.invoke('card:listByProfile', { profileId }),
    create: async (input: {
      profileId: number;
      name: string;
      issuer?: string | null;
      lastFour?: string | null;
      network?: string | null;
      annualFee?: number | null;
      benefitsNotes?: string | null;
    }): Promise<CreditCard> => ipcRenderer.invoke('card:create', input),
    update: async (input: {
      id: number;
      name: string;
      issuer?: string | null;
      lastFour?: string | null;
      network?: string | null;
      annualFee?: number | null;
      benefitsNotes?: string | null;
    }): Promise<CreditCard> => ipcRenderer.invoke('card:update', input),
    delete: async (id: number): Promise<void> =>
      ipcRenderer.invoke('card:delete', { id }),
    perkCreate: async (input: {
      cardId: number;
      label: string;
      categoryTags?: string | null;
      cashbackDetail: string;
      sortOrder?: number;
    }): Promise<CreditCard> => ipcRenderer.invoke('card:perk:create', input),
    perkUpdate: async (input: {
      id: number;
      label: string;
      categoryTags?: string | null;
      cashbackDetail: string;
      sortOrder?: number;
    }): Promise<CreditCard> => ipcRenderer.invoke('card:perk:update', input),
    perkDelete: async (perkId: number): Promise<void> =>
      ipcRenderer.invoke('card:perk:delete', { perkId }),
    setActivePerk: async (args: {
      cardId: number;
      perkId: number | null;
    }): Promise<CreditCard> => ipcRenderer.invoke('card:setActivePerk', args),
  },
  portfolio: {
    listByProfile: async (profileId: number): Promise<PortfolioAccount[]> =>
      ipcRenderer.invoke('portfolio:listByProfile', { profileId }),
    create: async (input: {
      profileId: number;
      name: string;
      note?: string | null;
      sortOrder?: number;
    }): Promise<PortfolioAccount> =>
      ipcRenderer.invoke('portfolio:create', input),
    update: async (input: {
      id: number;
      profileId: number;
      name: string;
      note?: string | null;
      sortOrder?: number;
    }): Promise<PortfolioAccount> =>
      ipcRenderer.invoke('portfolio:update', input),
    delete: async (input: { id: number; profileId: number }): Promise<void> =>
      ipcRenderer.invoke('portfolio:delete', input),
    snapshotUpsert: async (input: {
      accountId: number;
      profileId: number;
      date: string;
      value: number;
    }): Promise<PortfolioAccount> =>
      ipcRenderer.invoke('portfolio:snapshot:upsert', input),
    snapshotUpdate: async (input: {
      id: number;
      profileId: number;
      date: string;
      value: number;
    }): Promise<PortfolioAccount> =>
      ipcRenderer.invoke('portfolio:snapshot:update', input),
    snapshotDelete: async (input: {
      id: number;
      profileId: number;
    }): Promise<void> => ipcRenderer.invoke('portfolio:snapshot:delete', input),
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
      showOnDashboard?: boolean;
    }): Promise<Goal> => ipcRenderer.invoke('goal:create', input),
    update: async (input: {
      id: number;
      name?: string;
      targetAmount?: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
      showOnDashboard?: boolean;
    }): Promise<Goal> => ipcRenderer.invoke('goal:update', input),
    delete: async (input: { id: number; profileId: number }): Promise<void> =>
      ipcRenderer.invoke('goal:delete', input),
  },
  goalAllocation: {
    listByProfile: async (
      profileId: number,
    ): Promise<GoalAllocation[]> =>
      ipcRenderer.invoke('goalAllocation:listByProfile', { profileId }),
    setForGoal: async (input: {
      goalId: number;
      profileId: number;
      items: { subcategoryId: number; percent: number | null }[];
    }): Promise<void> => ipcRenderer.invoke('goalAllocation:setForGoal', input),
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
    openFile: async (filePath: string): Promise<void> =>
      ipcRenderer.invoke('receipt:openFile', { filePath }),
  },
};

contextBridge.exposeInMainWorld('fundlog', api);

