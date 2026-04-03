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
  type CreditCard,
  type CreditCardPerk,
} from '../shared/types.js';

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

  spendSummaryForBudget(budgetId: number): { totalAmount: number; count: number } {
    const row = db()
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS totalAmount, COUNT(*) AS count
         FROM transactions WHERE budget_id = ?`,
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

