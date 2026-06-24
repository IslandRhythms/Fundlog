export type RuleSetKey = 'fiftyThirtyTwenty' | 'custom';

export interface Profile {
  id: number;
  name: string;
  currencyCode: string;
  startingMonth: string; // YYYY-MM
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: number;
  profileId: number;
  name: string;
  startMonth: string; // YYYY-MM
  endMonth: string | null;
  monthlyIncome: number;
  ruleSet: RuleSetKey;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

/** One-time extra income for a specific budget + calendar month (e.g. extra shift). */
export interface BudgetMonthIncomeBoost {
  id: number;
  budgetId: number;
  month: string; // YYYY-MM
  amount: number;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategory {
  id: number;
  budgetId: number;
  label: string;
  ruleKey: string; // e.g. 'needs', 'wants', 'savingsDebt'
  targetPercent: number;
  color: string;
  sortOrder: number;
}

export interface BudgetSubcategory {
  id: number;
  budgetId: number;
  parentCategoryId: number | null;
  label: string;
  targetPercent: number | null;
  targetAmount: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  isFlexible: number;
  /** Total cost spread evenly across this many months (default 1). */
  spreadMonths: number;
  /** First calendar month the spread applies (YYYY-MM); used when spreadMonths > 1. */
  spreadStartMonth: string | null;
  sortOrder: number;
}

export type TransactionSource = 'manual' | 'csv' | 'ocr';

/** Manual spending type: purchase = logged against a line item; unexpected = unplanned. */
export type TransactionEntryKind = 'purchase' | 'unexpected';

export interface Transaction {
  id: number;
  profileId: number;
  budgetId: number | null;
  subcategoryId: number | null;
  date: string; // ISO date
  amount: number;
  /** Total amount spread evenly across this many months from the transaction date (default 1). */
  spreadMonths: number;
  merchant: string | null;
  description: string | null;
  source: TransactionSource;
  goalId: number | null;
  entryKind: TransactionEntryKind | null;
  createdAt: string;
  updatedAt: string;
}

export type ReceiptOcrStatus = 'pending' | 'success' | 'error' | 'skipped';

export interface Receipt {
  id: number;
  transactionId: number | null;
  filePath: string;
  uploadedAt: string;
  ocrStatus: ReceiptOcrStatus;
  expectedAmount: number | null;
  extractedAmount: number | null;
  extractedDate: string | null;
  merchant: string | null;
  rawOcrText: string | null;
}

export interface Goal {
  id: number;
  profileId: number;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  priority: number;
  note: string | null;
  /** When true, this goal may appear on the Dashboard (up to three, by priority). */
  showOnDashboard: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalAllocation {
  id: number;
  goalId: number;
  subcategoryId: number;
  percent: number | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface CreditCardPerk {
  id: number;
  cardId: number;
  label: string;
  categoryTags: string | null;
  cashbackDetail: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditCard {
  id: number;
  profileId: number;
  name: string;
  issuer: string | null;
  lastFour: string | null;
  network: string | null;
  annualFee: number | null;
  benefitsNotes: string | null;
  activePerkId: number | null;
  createdAt: string;
  updatedAt: string;
  perks: CreditCardPerk[];
}

/** Optional overrides for CSS variables (hex or any valid CSS color). */
export type CustomThemeColors = Partial<{
  bg: string;
  shellBg: string;
  cardBg: string;
  cardText: string;
  text: string;
  textH: string;
  muted: string;
  border: string;
  cardBorder: string;
  accent: string;
}>;

export type CustomThemeConfig = {
  enabled: boolean;
  colors: CustomThemeColors;
};

export type AppPrefs = {
  databasePath?: string;
  customTheme?: CustomThemeConfig | null;
};

