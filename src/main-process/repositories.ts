import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import {
  type Profile,
  type Budget,
  type BudgetCategory,
  type BudgetSubcategory,
  type Transaction,
  type Goal,
  type Receipt,
} from '../shared/types.js';

const db = (): Database.Database => getDb();

const now = () => new Date().toISOString();

export const ProfileRepository = {
  list(): Profile[] {
    return db()
      .prepare(
        'SELECT id, name, currency_code AS currencyCode, starting_month AS startingMonth, created_at AS createdAt, updated_at AS updatedAt FROM profiles ORDER BY created_at ASC'
      )
      .all() as Profile[];
  },
  create(input: { name: string; currencyCode: string; startingMonth: string }): Profile {
    const createdAt = now();
    const result = db()
      .prepare(
        `INSERT INTO profiles (name, currency_code, starting_month, created_at, updated_at)
         VALUES (@name, @currencyCode, @startingMonth, @createdAt, @createdAt)`
      )
      .run({ ...input, createdAt });
    const id = Number(result.lastInsertRowid);
    return this.getById(id)!;
  },
  getById(id: number): Profile | undefined {
    return db()
      .prepare(
        'SELECT id, name, currency_code AS currencyCode, starting_month AS startingMonth, created_at AS createdAt, updated_at AS updatedAt FROM profiles WHERE id = ?'
      )
      .get(id) as Profile | undefined;
  },
};

export const BudgetRepository = {
  listByProfile(profileId: number): Budget[] {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, name, start_month AS startMonth,
                end_month AS endMonth, monthly_income AS monthlyIncome,
                rule_set AS ruleSet, is_active AS isActive,
                created_at AS createdAt, updated_at AS updatedAt
         FROM budgets
         WHERE profile_id = ?
         ORDER BY start_month DESC`
      )
      .all(profileId) as Budget[];
  },
  create(input: {
    profileId: number;
    name: string;
    startMonth: string;
    endMonth?: string | null;
    monthlyIncome: number;
    ruleSet: string;
    isActive?: boolean;
  }): Budget {
    const createdAt = now();
    const result = db()
      .prepare(
        `INSERT INTO budgets
         (profile_id, name, start_month, end_month, monthly_income, rule_set, is_active, created_at, updated_at)
         VALUES (@profileId, @name, @startMonth, @endMonth, @monthlyIncome, @ruleSet, @isActive, @createdAt, @createdAt)`
      )
      .run({
        ...input,
        endMonth: input.endMonth ?? null,
        isActive: input.isActive ? 1 : 0,
        createdAt,
      });
    const id = Number(result.lastInsertRowid);
    return this.getById(id)!;
  },
  getById(id: number): Budget | undefined {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, name, start_month AS startMonth,
                end_month AS endMonth, monthly_income AS monthlyIncome,
                rule_set AS ruleSet, is_active AS isActive,
                created_at AS createdAt, updated_at AS UpdatedAt
         FROM budgets WHERE id = ?`
      )
      .get(id) as Budget | undefined;
  },
};

export const CategoryRepository = {
  ensureDefaultRuleCategories(budgetId: number, ruleSet: string) {
    if (ruleSet !== 'fiftyThirtyTwenty') return;
    const hasRows = db()
      .prepare('SELECT 1 FROM budget_categories WHERE budget_id = ? LIMIT 1')
      .get(budgetId);
    if (hasRows) return;

    const stmt = db().prepare(
      `INSERT INTO budget_categories (budget_id, label, rule_key, target_percent, color, sort_order)
       VALUES (@budgetId, @label, @ruleKey, @targetPercent, @color, @sortOrder)`
    );
    const rows = [
      {
        budgetId,
        label: 'Needs',
        ruleKey: 'needs',
        targetPercent: 50,
        color: '#6366f1',
        sortOrder: 1,
      },
      {
        budgetId,
        label: 'Wants',
        ruleKey: 'wants',
        targetPercent: 30,
        color: '#ec4899',
        sortOrder: 2,
      },
      {
        budgetId,
        label: 'Savings / Debt',
        ruleKey: 'savingsDebt',
        targetPercent: 20,
        color: '#22c55e',
        sortOrder: 3,
      },
    ];
    const tx = db().transaction(() => {
      for (const row of rows) stmt.run(row);
    });
    tx();
  },
  listByBudget(budgetId: number): { categories: BudgetCategory[]; subcategories: BudgetSubcategory[] } {
    const categories = db()
      .prepare(
        `SELECT id, budget_id AS budgetId, label, rule_key AS ruleKey,
                target_percent AS targetPercent, color, sort_order AS sortOrder
         FROM budget_categories
         WHERE budget_id = ?
         ORDER BY sort_order ASC`
      )
      .all(budgetId) as BudgetCategory[];

    const subcategories = db()
      .prepare(
        `SELECT id, budget_id AS budgetId, parent_category_id AS parentCategoryId,
                label, target_percent AS targetPercent, target_amount AS targetAmount,
                min_amount AS minAmount, max_amount AS maxAmount,
                is_flexible AS isFlexible, sort_order AS sortOrder
         FROM budget_subcategories
         WHERE budget_id = ?
         ORDER BY sort_order ASC`
      )
      .all(budgetId) as BudgetSubcategory[];

    return { categories, subcategories };
  },
  updateColor(input: { id: number; color: string; budgetId: number }) {
    db()
      .prepare(
        `UPDATE budget_categories
         SET color = @color
         WHERE id = @id`,
      )
      .run({ id: input.id, color: input.color });
    return this.listByBudget(input.budgetId);
  },
  createSubcategory(input: {
    budgetId: number;
    parentCategoryId: number | null;
    label: string;
    targetPercent?: number | null;
    targetAmount?: number | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    isFlexible: boolean;
    sortOrder?: number;
  }): { categories: BudgetCategory[]; subcategories: BudgetSubcategory[] } {
    const stmt = db().prepare(
      `INSERT INTO budget_subcategories
       (budget_id, parent_category_id, label, target_percent, target_amount, min_amount, max_amount, is_flexible, sort_order)
       VALUES (@budgetId, @parentCategoryId, @label, @targetPercent, @targetAmount, @minAmount, @maxAmount, @isFlexible, @sortOrder)`
    );
    stmt.run({
      budgetId: input.budgetId,
      parentCategoryId: input.parentCategoryId,
      label: input.label,
      targetPercent: input.targetPercent ?? null,
      targetAmount: input.isFlexible ? null : input.targetAmount ?? null,
      minAmount: input.isFlexible ? input.minAmount ?? null : null,
      maxAmount: input.isFlexible ? input.maxAmount ?? null : null,
      isFlexible: input.isFlexible ? 1 : 0,
      sortOrder: input.sortOrder ?? 99,
    });
    return this.listByBudget(input.budgetId);
  },
};

export const TransactionRepository = {
  listByBudget(profileId: number, budgetId: number | null): Transaction[] {
    const stmt = budgetId
      ? `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, merchant,
                description, source, goal_id AS goalId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ? AND budget_id = ?
         ORDER BY date DESC`
      : `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, merchant,
                description, source, goal_id AS goalId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ?
         ORDER BY date DESC`;
    return db()
      .prepare(stmt)
      .all(budgetId ? [profileId, budgetId] : [profileId]) as Transaction[];
  },
  listUnexpected(profileId: number, budgetId: number): Transaction[] {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, merchant,
                description, source, goal_id AS goalId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ? AND budget_id = ? AND source = 'manual'
         ORDER BY date DESC, created_at DESC`,
      )
      .all(profileId, budgetId) as Transaction[];
  },
  createBulk(input: {
    profileId: number;
    budgetId: number | null;
    rows: {
      date: string;
      amount: number;
      merchant?: string | null;
      description?: string | null;
    }[];
  }): Transaction[] {
    const createdAt = now();
    const insert = db().prepare(
      `INSERT INTO transactions
       (profile_id, budget_id, subcategory_id, date, amount, merchant, description, source, goal_id, created_at, updated_at)
       VALUES (@profileId, @budgetId, NULL, @date, @amount, @merchant, @description, 'csv', NULL, @createdAt, @createdAt)`
    );
    const tx = db().transaction(() => {
      for (const row of input.rows) {
        insert.run({
          profileId: input.profileId,
          budgetId: input.budgetId,
          date: row.date,
          amount: row.amount,
          merchant: row.merchant ?? null,
          description: row.description ?? null,
          createdAt,
        });
      }
    });
    tx();
    return this.listByBudget(input.profileId, input.budgetId);
  },
  createManual(input: {
    profileId: number;
    budgetId: number;
    subcategoryId: number | null;
    date: string;
    amount: number;
    description?: string | null;
  }): Transaction {
    const createdAt = now();
    const stmt = db().prepare(
      `INSERT INTO transactions
       (profile_id, budget_id, subcategory_id, date, amount, merchant, description, source, goal_id, created_at, updated_at)
       VALUES (@profileId, @budgetId, @subcategoryId, @date, @amount, NULL, @description, 'manual', NULL, @createdAt, @createdAt)`,
    );
    const result = stmt.run({
      profileId: input.profileId,
      budgetId: input.budgetId,
      subcategoryId: input.subcategoryId,
      date: input.date,
      amount: input.amount,
      description: input.description ?? null,
      createdAt,
    });
    const id = Number(result.lastInsertRowid);
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, merchant,
                description, source, goal_id AS goalId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE id = ?`,
      )
      .get(id) as Transaction;
  },
};

export const GoalRepository = {
  listByProfile(profileId: number): Goal[] {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, name, target_amount AS targetAmount,
                target_date AS targetDate, priority, note,
                created_at AS createdAt, updated_at AS updatedAt
         FROM goals
         WHERE profile_id = ?
         ORDER BY priority DESC, created_at ASC`
      )
      .all(profileId) as Goal[];
  },
  create(input: {
    profileId: number;
    name: string;
    targetAmount: number;
    targetDate?: string | null;
    priority?: number;
    note?: string | null;
  }): Goal {
    const createdAt = now();
    const result = db()
      .prepare(
        `INSERT INTO goals
         (profile_id, name, target_amount, target_date, priority, note, created_at, updated_at)
         VALUES (@profileId, @name, @targetAmount, @targetDate, @priority, @note, @createdAt, @createdAt)`
      )
      .run({
        ...input,
        targetDate: input.targetDate ?? null,
        priority: input.priority ?? 0,
        note: input.note ?? null,
        createdAt,
      });
    const id = Number(result.lastInsertRowid);
    return this.listByProfile(input.profileId).find((g) => g.id === id)!;
  },
};

export const ReceiptRepository = {
  listByTransaction(transactionId: number): Receipt[] {
    return db()
      .prepare(
        `SELECT id,
                transaction_id AS transactionId,
                file_path AS filePath,
                uploaded_at AS uploadedAt,
                ocr_status AS ocrStatus,
                expected_amount AS expectedAmount,
                extracted_amount AS extractedAmount,
                extracted_date AS extractedDate,
                merchant,
                raw_ocr_text AS rawOcrText
         FROM receipts
         WHERE transaction_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(transactionId) as Receipt[];
  },
  create(input: {
    transactionId: number | null;
    filePath: string;
    expectedAmount?: number | null;
    merchant?: string | null;
  }): Receipt {
    const uploadedAt = now();
    const stmt = db().prepare(
      `INSERT INTO receipts
       (transaction_id, file_path, uploaded_at, ocr_status,
        expected_amount, extracted_amount, extracted_date, merchant, raw_ocr_text)
       VALUES (@transactionId, @filePath, @uploadedAt, @ocrStatus,
               @expectedAmount, NULL, NULL, @merchant, NULL)`
    );
    const result = stmt.run({
      transactionId: input.transactionId,
      filePath: input.filePath,
      uploadedAt,
      ocrStatus: 'pending',
      expectedAmount: input.expectedAmount ?? null,
      merchant: input.merchant ?? null,
    });
    const id = Number(result.lastInsertRowid);
    return db()
      .prepare(
        `SELECT id,
                transaction_id AS transactionId,
                file_path AS filePath,
                uploaded_at AS uploadedAt,
                ocr_status AS ocrStatus,
                expected_amount AS expectedAmount,
                extracted_amount AS extractedAmount,
                extracted_date AS extractedDate,
                merchant,
                raw_ocr_text AS rawOcrText
         FROM receipts
         WHERE id = ?`
      )
      .get(id) as Receipt;
  },

  updateOcrResult(input: {
    id: number;
    ocrStatus: 'pending' | 'success' | 'error' | 'skipped';
    extractedAmount: number | null;
    extractedDate: string | null;
    merchant: string | null;
    rawOcrText: string | null;
  }): Receipt {
    db()
      .prepare(
        `UPDATE receipts
         SET ocr_status = @ocrStatus,
             extracted_amount = @extractedAmount,
             extracted_date = @extractedDate,
             merchant = @merchant,
             raw_ocr_text = @rawOcrText
         WHERE id = @id`
      )
      .run(input);

    return db()
      .prepare(
        `SELECT id,
                transaction_id AS transactionId,
                file_path AS filePath,
                uploaded_at AS uploadedAt,
                ocr_status AS ocrStatus,
                expected_amount AS expectedAmount,
                extracted_amount AS extractedAmount,
                extracted_date AS extractedDate,
                merchant,
                raw_ocr_text AS rawOcrText
         FROM receipts
         WHERE id = ?`
      )
      .get(input.id) as Receipt;
  },
};

