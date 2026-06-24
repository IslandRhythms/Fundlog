import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import {
  type Profile,
  type Budget,
  type BudgetCategory,
  type BudgetSubcategory,
  type Transaction,
  type Goal,
  type GoalAllocation,
  type BudgetMonthIncomeBoost,
  type Receipt,
  type CreditCard,
  type CreditCardPerk,
} from '../shared/types.js';
import { errorMessageFromUnknown } from '../shared/errors.js';

const db = (): Database.Database => getDb();

const now = () => new Date().toISOString();

/** `month` is YYYY-MM. Returns [start, endExclusive) as ISO date strings. */
function isoMonthRange(month: string): { start: string; endExclusive: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) throw new TypeError('Invalid month; expected YYYY-MM');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new TypeError('Invalid month');
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${y}-${pad(mo)}-01`;
  let ny = y;
  let nm = mo + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const endExclusive = `${ny}-${pad(nm)}-01`;
  return { start, endExclusive };
}

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

function boostFromRow(row: Record<string, unknown>): BudgetMonthIncomeBoost {
  return {
    id: row.id as number,
    budgetId: row.budgetId as number,
    month: row.month as string,
    amount: row.amount as number,
    label: (row.label as string | null) ?? null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

export const BudgetMonthIncomeBoostRepository = {
  listByProfile(profileId: number): BudgetMonthIncomeBoost[] {
    const rows = db()
      .prepare(
        `SELECT b.id AS id, b.budget_id AS budgetId, b.month AS month, b.amount AS amount,
                b.label AS label, b.created_at AS createdAt, b.updated_at AS updatedAt
         FROM budget_month_income_boosts b
         INNER JOIN budgets bud ON bud.id = b.budget_id
         WHERE bud.profile_id = ?
         ORDER BY b.month DESC, b.id DESC`,
      )
      .all(profileId) as Record<string, unknown>[];
    return rows.map(boostFromRow);
  },
  create(input: {
    budgetId: number;
    month: string;
    amount: number;
    label?: string | null;
  }): BudgetMonthIncomeBoost {
    const bud = BudgetRepository.getById(input.budgetId);
    if (!bud) {
      throw new Error('Budget not found.');
    }
    const month = input.month.trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Month must be YYYY-MM.');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Amount must be a positive number.');
    }
    const createdAt = now();
    const label =
      input.label === undefined || input.label === null
        ? null
        : input.label.trim() || null;
    try {
      const result = db()
        .prepare(
          `INSERT INTO budget_month_income_boosts
         (budget_id, month, amount, label, created_at, updated_at)
         VALUES (@budgetId, @month, @amount, @label, @createdAt, @createdAt)`,
        )
        .run({
          budgetId: input.budgetId,
          month,
          amount: input.amount,
          label,
          createdAt,
        });
      const id = Number(result.lastInsertRowid);
      const row = db()
        .prepare(
          `SELECT id, budget_id AS budgetId, month, amount, label,
                created_at AS createdAt, updated_at AS updatedAt
         FROM budget_month_income_boosts WHERE id = ?`,
        )
        .get(id) as Record<string, unknown>;
      return boostFromRow(row);
    } catch (e) {
      throw new Error(
        `Could not save extra income: ${errorMessageFromUnknown(e)}`,
      );
    }
  },
  delete(id: number): void {
    const result = db()
      .prepare('DELETE FROM budget_month_income_boosts WHERE id = ?')
      .run(id);
    if (result.changes === 0) {
      throw new Error('Extra income entry not found.');
    }
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
        color: '#2563eb',
        sortOrder: 1,
      },
      {
        budgetId,
        label: 'Wants',
        ruleKey: 'wants',
        targetPercent: 30,
        color: '#db2777',
        sortOrder: 2,
      },
      {
        budgetId,
        label: 'Savings / Debt',
        ruleKey: 'savingsDebt',
        targetPercent: 20,
        color: '#d97706',
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
                is_flexible AS isFlexible, spread_months AS spreadMonths,
                spread_start_month AS spreadStartMonth, sort_order AS sortOrder
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
    spreadMonths?: number;
    spreadStartMonth?: string | null;
    sortOrder?: number;
  }): { categories: BudgetCategory[]; subcategories: BudgetSubcategory[] } {
    const spreadMonths = Math.max(1, Math.floor(input.spreadMonths ?? 1));
    const stmt = db().prepare(
      `INSERT INTO budget_subcategories
       (budget_id, parent_category_id, label, target_percent, target_amount, min_amount, max_amount, is_flexible, spread_months, spread_start_month, sort_order)
       VALUES (@budgetId, @parentCategoryId, @label, @targetPercent, @targetAmount, @minAmount, @maxAmount, @isFlexible, @spreadMonths, @spreadStartMonth, @sortOrder)`
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
      spreadMonths,
      spreadStartMonth:
        spreadMonths > 1 ? input.spreadStartMonth ?? null : null,
      sortOrder: input.sortOrder ?? 99,
    });
    return this.listByBudget(input.budgetId);
  },
  updateSubcategory(input: {
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
  }): { categories: BudgetCategory[]; subcategories: BudgetSubcategory[] } {
    const spreadMonths = Math.max(1, Math.floor(input.spreadMonths ?? 1));
    db()
      .prepare(
        `UPDATE budget_subcategories
         SET label = @label,
             target_percent = @targetPercent,
             target_amount = @targetAmount,
             min_amount = @minAmount,
             max_amount = @maxAmount,
             is_flexible = @isFlexible,
             spread_months = @spreadMonths,
             spread_start_month = @spreadStartMonth
         WHERE id = @id AND budget_id = @budgetId`,
      )
      .run({
        id: input.id,
        budgetId: input.budgetId,
        label: input.label,
        targetPercent: input.targetPercent ?? null,
        targetAmount: input.isFlexible ? null : input.targetAmount ?? null,
        minAmount: input.isFlexible ? input.minAmount ?? null : null,
        maxAmount: input.isFlexible ? input.maxAmount ?? null : null,
        isFlexible: input.isFlexible ? 1 : 0,
        spreadMonths,
        spreadStartMonth:
          spreadMonths > 1 ? input.spreadStartMonth ?? null : null,
      });
    return this.listByBudget(input.budgetId);
  },
  deleteSubcategory(input: {
    id: number;
    budgetId: number;
  }): { categories: BudgetCategory[]; subcategories: BudgetSubcategory[] } {
    db()
      .prepare('DELETE FROM budget_subcategories WHERE id = ? AND budget_id = ?')
      .run(input.id, input.budgetId);
    return this.listByBudget(input.budgetId);
  },
};

export const TransactionRepository = {
  listByBudget(profileId: number, budgetId: number | null): Transaction[] {
    const cols = `id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt`;
    const stmt = budgetId
      ? `SELECT ${cols}
         FROM transactions
         WHERE profile_id = ? AND budget_id = ?
         ORDER BY date DESC`
      : `SELECT ${cols}
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
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ? AND budget_id = ? AND source = 'manual'
           AND goal_id IS NULL AND entry_kind = 'unexpected'
         ORDER BY date DESC, created_at DESC`,
      )
      .all(profileId, budgetId) as Transaction[];
  },
  listPurchases(profileId: number, budgetId: number): Transaction[] {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ? AND budget_id = ? AND source = 'manual'
           AND goal_id IS NULL AND entry_kind = 'purchase'
         ORDER BY date DESC, created_at DESC`,
      )
      .all(profileId, budgetId) as Transaction[];
  },
  /** Manual transactions tied to a goal (Record savings); excluded from unexpected totals. */
  listGoalContributions(profileId: number, budgetId: number): Transaction[] {
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE profile_id = ? AND budget_id = ? AND source = 'manual' AND goal_id IS NOT NULL
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
  /** One-off ledger entry (Transactions page) — not a purchase or unexpected expense. */
  createSingle(input: {
    profileId: number;
    budgetId: number;
    date: string;
    amount: number;
    merchant?: string | null;
    description?: string | null;
  }): Transaction {
    const createdAt = now();
    const stmt = db().prepare(
      `INSERT INTO transactions
       (profile_id, budget_id, subcategory_id, date, amount, spread_months, merchant, description, source, goal_id, entry_kind, created_at, updated_at)
       VALUES (@profileId, @budgetId, NULL, @date, @amount, 1, @merchant, @description, 'manual', NULL, NULL, @createdAt, @createdAt)`,
    );
    const result = stmt.run({
      profileId: input.profileId,
      budgetId: input.budgetId,
      date: input.date,
      amount: input.amount,
      merchant: input.merchant?.trim() || null,
      description: input.description?.trim() || null,
      createdAt,
    });
    const id = Number(result.lastInsertRowid);
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE id = ?`,
      )
      .get(id) as Transaction;
  },
  createManual(input: {
    profileId: number;
    budgetId: number;
    subcategoryId: number | null;
    date: string;
    amount: number;
    description?: string | null;
    goalId?: number | null;
    spreadMonths?: number;
    entryKind?: 'purchase' | 'unexpected' | null;
  }): Transaction {
    const goalId = input.goalId ?? null;
    if (goalId != null) {
      const row = db()
        .prepare(
          'SELECT profile_id AS profileId, target_amount AS targetAmount FROM goals WHERE id = ?',
        )
        .get(goalId) as { profileId: number; targetAmount: number } | undefined;
      if (!row || row.profileId !== input.profileId) {
        throw new Error('Goal not found for this profile.');
      }
      const savedRow = db()
        .prepare(
          'SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE goal_id = ?',
        )
        .get(goalId) as { total: number };
      const saved = savedRow?.total ?? 0;
      if (input.amount + saved > row.targetAmount + 1e-6) {
        throw new Error(
          "That amount would go over this goal's target. Lower the amount or raise the target on the goal.",
        );
      }
    }
    const createdAt = now();
    const spreadMonths = Math.max(1, Math.floor(input.spreadMonths ?? 1));
    let entryKind: string | null = null;
    if (goalId == null) {
      entryKind = input.entryKind ?? 'unexpected';
      if (entryKind === 'purchase' && input.subcategoryId == null) {
        throw new Error('Purchases must be linked to a line item.');
      }
    }
    const stmt = db().prepare(
      `INSERT INTO transactions
       (profile_id, budget_id, subcategory_id, date, amount, spread_months, merchant, description, source, goal_id, entry_kind, created_at, updated_at)
       VALUES (@profileId, @budgetId, @subcategoryId, @date, @amount, @spreadMonths, NULL, @description, 'manual', @goalId, @entryKind, @createdAt, @createdAt)`,
    );
    const result = stmt.run({
      profileId: input.profileId,
      budgetId: input.budgetId,
      subcategoryId: input.subcategoryId,
      date: input.date,
      amount: input.amount,
      spreadMonths,
      description: input.description ?? null,
      goalId,
      entryKind,
      createdAt,
    });
    const id = Number(result.lastInsertRowid);
    return db()
      .prepare(
        `SELECT id, profile_id AS profileId, budget_id AS budgetId,
                subcategory_id AS subcategoryId, date, amount, spread_months AS spreadMonths, merchant,
                description, source, goal_id AS goalId, entry_kind AS entryKind,
                created_at AS createdAt, updated_at AS updatedAt
         FROM transactions
         WHERE id = ?`,
      )
      .get(id) as Transaction;
  },

  spendSummaryForBudget(budgetId: number): { totalAmount: number; count: number } {
    const row = db()
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS totalAmount, COUNT(*) AS count
         FROM transactions WHERE budget_id = ? AND goal_id IS NULL`,
      )
      .get(budgetId) as { totalAmount: number; count: number };
    return { totalAmount: row.totalAmount, count: row.count };
  },

  /** Deletes all transactions for this budget whose date falls in the given calendar month. */
  deleteForBudgetInMonth(budgetId: number, month: string): number {
    const { start, endExclusive } = isoMonthRange(month);
    const result = db()
      .prepare(
        `DELETE FROM transactions
         WHERE budget_id = ? AND date >= ? AND date < ?`,
      )
      .run(budgetId, start, endExclusive);
    return result.changes;
  },
};

function goalFromRow(row: Record<string, unknown>): Goal {
  const showRaw = row.showOnDashboard ?? row.show_on_dashboard;
  const showOn =
    showRaw === undefined || showRaw === null ? true : Number(showRaw) === 1;
  return {
    id: row.id as number,
    profileId: row.profileId as number,
    name: row.name as string,
    targetAmount: row.targetAmount as number,
    targetDate: (row.targetDate as string | null) ?? null,
    priority: row.priority as number,
    note: (row.note as string | null) ?? null,
    showOnDashboard: showOn,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function assertPositiveTargetAmount(amount: number, field = 'Target amount'): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
}

export const GoalRepository = {
  listByProfile(profileId: number): Goal[] {
    const rows = db()
      .prepare(
        `SELECT id, profile_id AS profileId, name, target_amount AS targetAmount,
                target_date AS targetDate, priority, note,
                show_on_dashboard AS showOnDashboard,
                created_at AS createdAt, updated_at AS updatedAt
         FROM goals
         WHERE profile_id = ?
         ORDER BY priority DESC, created_at ASC`,
      )
      .all(profileId) as Record<string, unknown>[];
    return rows.map(goalFromRow);
  },
  create(input: {
    profileId: number;
    name: string;
    targetAmount: number;
    targetDate?: string | null;
    priority?: number;
    note?: string | null;
    showOnDashboard?: boolean;
  }): Goal {
    const trimmedName = input.name?.trim() ?? '';
    if (!trimmedName) {
      throw new Error('Goal name is required.');
    }
    assertPositiveTargetAmount(input.targetAmount);
    const createdAt = now();
    const showOn = input.showOnDashboard === false ? 0 : 1;
    const note =
      input.note === undefined || input.note === null
        ? null
        : input.note.trim() || null;
    let id: number;
    try {
      const result = db()
        .prepare(
          `INSERT INTO goals
         (profile_id, name, target_amount, target_date, priority, note, show_on_dashboard, created_at, updated_at)
         VALUES (@profileId, @name, @targetAmount, @targetDate, @priority, @note, @showOn, @createdAt, @createdAt)`,
        )
        .run({
          profileId: input.profileId,
          name: trimmedName,
          targetAmount: input.targetAmount,
          targetDate: input.targetDate ?? null,
          priority: input.priority ?? 0,
          note,
          showOn,
          createdAt,
        });
      id = Number(result.lastInsertRowid);
    } catch (e) {
      throw new Error(`Could not create goal: ${errorMessageFromUnknown(e)}`);
    }
    const row = this.listByProfile(input.profileId).find((g: Goal) => g.id === id);
    if (!row) {
      throw new Error('Goal was created but could not be loaded.');
    }
    return row;
  },
  update(input: {
    id: number;
    name?: string;
    targetAmount?: number;
    targetDate?: string | null;
    priority?: number;
    note?: string | null;
    showOnDashboard?: boolean;
  }): Goal {
    const pidRow = db()
      .prepare('SELECT profile_id AS profileId FROM goals WHERE id = ?')
      .get(input.id) as { profileId: number } | undefined;
    if (!pidRow) {
      throw new Error('Goal not found.');
    }
    const current = this.listByProfile(pidRow.profileId).find(
      (g: Goal) => g.id === input.id,
    );
    if (!current) {
      throw new Error('Goal not found.');
    }
    const updatedAt = now();
    const name =
      input.name !== undefined ? input.name.trim() : current.name;
    if (!name) {
      throw new Error('Goal name cannot be empty.');
    }
    const targetAmount =
      input.targetAmount !== undefined
        ? input.targetAmount
        : current.targetAmount;
    if (input.targetAmount !== undefined) {
      assertPositiveTargetAmount(targetAmount);
    }
    const targetDate =
      input.targetDate !== undefined ? input.targetDate : current.targetDate;
    const priority =
      input.priority !== undefined ? input.priority : current.priority;
    if (
      input.priority !== undefined &&
      (!Number.isFinite(priority) || priority < 1 || priority > 5)
    ) {
      throw new Error('Priority must be between 1 and 5.');
    }
    const note =
      input.note !== undefined
        ? input.note === null
          ? null
          : input.note.trim() || null
        : current.note;
    const showOn =
      input.showOnDashboard !== undefined
        ? input.showOnDashboard
          ? 1
          : 0
        : current.showOnDashboard
          ? 1
          : 0;
    try {
      db()
        .prepare(
          `UPDATE goals SET name = @name, target_amount = @targetAmount,
           target_date = @targetDate, priority = @priority, note = @note,
           show_on_dashboard = @showOn, updated_at = @updatedAt
         WHERE id = @id`,
        )
        .run({
          id: input.id,
          name,
          targetAmount,
          targetDate,
          priority,
          note,
          showOn,
          updatedAt,
        });
    } catch (e) {
      throw new Error(`Could not update goal: ${errorMessageFromUnknown(e)}`);
    }
    const next = this.listByProfile(pidRow.profileId).find(
      (g: Goal) => g.id === input.id,
    );
    if (!next) {
      throw new Error('Goal was updated but could not be reloaded.');
    }
    return next;
  },
  delete(input: { id: number; profileId: number }): void {
    const row = db()
      .prepare('SELECT profile_id AS profileId FROM goals WHERE id = ?')
      .get(input.id) as { profileId: number } | undefined;
    if (!row || row.profileId !== input.profileId) {
      throw new Error('Goal not found.');
    }
    const result = db().prepare('DELETE FROM goals WHERE id = ?').run(input.id);
    if (result.changes === 0) {
      throw new Error('Goal not found.');
    }
  },
};

function allocationFromRow(row: Record<string, unknown>): GoalAllocation {
  return {
    id: row.id as number,
    goalId: row.goalId as number,
    subcategoryId: row.subcategoryId as number,
    percent:
      row.percent === undefined || row.percent === null
        ? null
        : (row.percent as number),
  };
}

export const GoalAllocationRepository = {
  listByProfile(profileId: number): GoalAllocation[] {
    const rows = db()
      .prepare(
        `SELECT ga.id AS id, ga.goal_id AS goalId, ga.subcategory_id AS subcategoryId,
                ga.percent AS percent
         FROM goal_allocations ga
         INNER JOIN goals g ON g.id = ga.goal_id
         WHERE g.profile_id = ?
         ORDER BY ga.goal_id ASC, ga.id ASC`,
      )
      .all(profileId) as Record<string, unknown>[];
    return rows.map(allocationFromRow);
  },
  setForGoal(input: {
    goalId: number;
    profileId: number;
    items: { subcategoryId: number; percent: number | null }[];
  }): void {
    const gRow = db()
      .prepare('SELECT profile_id AS profileId FROM goals WHERE id = ?')
      .get(input.goalId) as { profileId: number } | undefined;
    if (!gRow || gRow.profileId !== input.profileId) {
      throw new Error('Goal not found.');
    }
    const seen = new Set<number>();
    for (const item of input.items) {
      if (seen.has(item.subcategoryId)) {
        throw new Error('Duplicate budget line for this goal.');
      }
      seen.add(item.subcategoryId);
      const ok = db()
        .prepare(
          `SELECT 1 FROM budget_subcategories bs
           INNER JOIN budgets b ON b.id = bs.budget_id
           WHERE bs.id = ? AND b.profile_id = ?`,
        )
        .get(item.subcategoryId, input.profileId);
      if (!ok) {
        throw new Error('Budget line not found for this profile.');
      }
    }
    const del = db().prepare('DELETE FROM goal_allocations WHERE goal_id = ?');
    const ins = db().prepare(
      `INSERT INTO goal_allocations (goal_id, subcategory_id, percent)
       VALUES (@goalId, @subcategoryId, @percent)`,
    );
    const txFn = db().transaction(() => {
      del.run(input.goalId);
      for (const item of input.items) {
        ins.run({
          goalId: input.goalId,
          subcategoryId: item.subcategoryId,
          percent: item.percent ?? null,
        });
      }
    });
    txFn();
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

function mapCreditCardPerk(row: Record<string, unknown>): CreditCardPerk {
  return {
    id: row.id as number,
    cardId: row.cardId as number,
    label: row.label as string,
    categoryTags: (row.categoryTags as string | null) ?? null,
    cashbackDetail: row.cashbackDetail as string,
    sortOrder: row.sortOrder as number,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function mapCreditCard(
  row: Record<string, unknown>,
  perks: CreditCardPerk[],
): CreditCard {
  return {
    id: row.id as number,
    profileId: row.profileId as number,
    name: row.name as string,
    issuer: (row.issuer as string | null) ?? null,
    lastFour: (row.lastFour as string | null) ?? null,
    network: (row.network as string | null) ?? null,
    annualFee:
      row.annualFee === null || row.annualFee === undefined
        ? null
        : (row.annualFee as number),
    benefitsNotes: (row.benefitsNotes as string | null) ?? null,
    activePerkId:
      row.activePerkId === null || row.activePerkId === undefined
        ? null
        : (row.activePerkId as number),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    perks,
  };
}

export const CreditCardRepository = {
  listByProfile(profileId: number): CreditCard[] {
    const rows = db()
      .prepare(
        `SELECT id, profile_id AS profileId, name, issuer, last_four AS lastFour,
                network, annual_fee AS annualFee, benefits_notes AS benefitsNotes,
                active_perk_id AS activePerkId, created_at AS createdAt, updated_at AS updatedAt
         FROM credit_cards
         WHERE profile_id = ?
         ORDER BY name ASC`,
      )
      .all(profileId) as Record<string, unknown>[];
    return rows.map((row) => {
      const id = row.id as number;
      const perkRows = db()
        .prepare(
          `SELECT id, card_id AS cardId, label, category_tags AS categoryTags,
                  cashback_detail AS cashbackDetail, sort_order AS sortOrder,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM credit_card_perks
           WHERE card_id = ?
           ORDER BY sort_order ASC, id ASC`,
        )
        .all(id) as Record<string, unknown>[];
      const perks = perkRows.map(mapCreditCardPerk);
      return mapCreditCard(row, perks);
    });
  },

  create(input: {
    profileId: number;
    name: string;
    issuer?: string | null;
    lastFour?: string | null;
    network?: string | null;
    annualFee?: number | null;
    benefitsNotes?: string | null;
  }): CreditCard {
    const createdAt = now();
    const result = db()
      .prepare(
        `INSERT INTO credit_cards
         (profile_id, name, issuer, last_four, network, annual_fee, benefits_notes, active_perk_id, created_at, updated_at)
         VALUES (@profileId, @name, @issuer, @lastFour, @network, @annualFee, @benefitsNotes, NULL, @createdAt, @createdAt)`,
      )
      .run({
        profileId: input.profileId,
        name: input.name.trim(),
        issuer: input.issuer?.trim() || null,
        lastFour: input.lastFour?.trim() || null,
        network: input.network?.trim() || null,
        annualFee: input.annualFee ?? null,
        benefitsNotes: input.benefitsNotes?.trim() || null,
        createdAt,
      });
    const id = Number(result.lastInsertRowid);
    return this.listByProfile(input.profileId).find((c) => c.id === id)!;
  },

  update(input: {
    id: number;
    name: string;
    issuer?: string | null;
    lastFour?: string | null;
    network?: string | null;
    annualFee?: number | null;
    benefitsNotes?: string | null;
  }): CreditCard {
    const updatedAt = now();
    db()
      .prepare(
        `UPDATE credit_cards
         SET name = @name, issuer = @issuer, last_four = @lastFour, network = @network,
             annual_fee = @annualFee, benefits_notes = @benefitsNotes, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({
        id: input.id,
        name: input.name.trim(),
        issuer: input.issuer?.trim() || null,
        lastFour: input.lastFour?.trim() || null,
        network: input.network?.trim() || null,
        annualFee: input.annualFee ?? null,
        benefitsNotes: input.benefitsNotes?.trim() || null,
        updatedAt,
      });
    const row = db()
      .prepare('SELECT profile_id AS profileId FROM credit_cards WHERE id = ?')
      .get(input.id) as { profileId: number };
    return this.listByProfile(row.profileId).find((c) => c.id === input.id)!;
  },

  delete(id: number): void {
    db().prepare('DELETE FROM credit_cards WHERE id = ?').run(id);
  },

  createPerk(input: {
    cardId: number;
    label: string;
    categoryTags?: string | null;
    cashbackDetail: string;
    sortOrder?: number;
  }): CreditCard {
    const createdAt = now();
    const maxSort =
      (db()
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) AS m FROM credit_card_perks WHERE card_id = ?',
        )
        .get(input.cardId) as { m: number }).m + 1;
    db()
      .prepare(
        `INSERT INTO credit_card_perks
         (card_id, label, category_tags, cashback_detail, sort_order, created_at, updated_at)
         VALUES (@cardId, @label, @categoryTags, @cashbackDetail, @sortOrder, @createdAt, @createdAt)`,
      )
      .run({
        cardId: input.cardId,
        label: input.label.trim(),
        categoryTags: input.categoryTags?.trim() || null,
        cashbackDetail: input.cashbackDetail.trim(),
        sortOrder: input.sortOrder ?? maxSort,
        createdAt,
      });
    const pid = (
      db()
        .prepare('SELECT profile_id AS profileId FROM credit_cards WHERE id = ?')
        .get(input.cardId) as { profileId: number }
    ).profileId;
    return this.listByProfile(pid).find((c) => c.id === input.cardId)!;
  },

  updatePerk(input: {
    id: number;
    label: string;
    categoryTags?: string | null;
    cashbackDetail: string;
    sortOrder?: number;
  }): CreditCard {
    const updatedAt = now();
    if (input.sortOrder != null) {
      db()
        .prepare(
          `UPDATE credit_card_perks
           SET label = @label, category_tags = @categoryTags, cashback_detail = @cashbackDetail,
               sort_order = @sortOrder, updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          id: input.id,
          label: input.label.trim(),
          categoryTags: input.categoryTags?.trim() || null,
          cashbackDetail: input.cashbackDetail.trim(),
          sortOrder: input.sortOrder,
          updatedAt,
        });
    } else {
      db()
        .prepare(
          `UPDATE credit_card_perks
           SET label = @label, category_tags = @categoryTags, cashback_detail = @cashbackDetail,
               updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          id: input.id,
          label: input.label.trim(),
          categoryTags: input.categoryTags?.trim() || null,
          cashbackDetail: input.cashbackDetail.trim(),
          updatedAt,
        });
    }
    const row = db()
      .prepare(
        'SELECT card_id AS cardId FROM credit_card_perks WHERE id = ?',
      )
      .get(input.id) as { cardId: number };
    const pid = (
      db()
        .prepare('SELECT profile_id AS profileId FROM credit_cards WHERE id = ?')
        .get(row.cardId) as { profileId: number }
    ).profileId;
    return this.listByProfile(pid).find((c) => c.id === row.cardId)!;
  },

  deletePerk(perkId: number): void {
    const row = db()
      .prepare(
        'SELECT card_id AS cardId FROM credit_card_perks WHERE id = ?',
      )
      .get(perkId) as { cardId: number } | undefined;
    if (!row) return;
    db().prepare('DELETE FROM credit_card_perks WHERE id = ?').run(perkId);
    db()
      .prepare(
        'UPDATE credit_cards SET active_perk_id = NULL WHERE id = ? AND active_perk_id = ?',
      )
      .run(row.cardId, perkId);
  },

  setActivePerk(cardId: number, perkId: number | null): CreditCard {
    if (perkId != null) {
      const ok = db()
        .prepare(
          'SELECT 1 FROM credit_card_perks WHERE id = ? AND card_id = ?',
        )
        .get(perkId, cardId);
      if (!ok) throw new Error('Perk does not belong to this card');
    }
    const updatedAt = now();
    db()
      .prepare(
        'UPDATE credit_cards SET active_perk_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(perkId, updatedAt, cardId);
    const pid = (
      db()
        .prepare('SELECT profile_id AS profileId FROM credit_cards WHERE id = ?')
        .get(cardId) as { profileId: number }
    ).profileId;
    return this.listByProfile(pid).find((c) => c.id === cardId)!;
  },
};

