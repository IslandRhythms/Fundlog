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
  isFlexible: number;
  sortOrder: number;
}

export type TransactionSource = 'manual' | 'csv' | 'ocr';

export interface Transaction {
  id: number;
  profileId: number;
  budgetId: number | null;
  subcategoryId: number | null;
  date: string; // ISO date
  amount: number;
  merchant: string | null;
  description: string | null;
  source: TransactionSource;
  goalId: number | null;
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

