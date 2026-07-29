import Database from 'better-sqlite3';
import { app } from 'electron';
import { dirname, join, normalize } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { readAppPrefs } from './app-prefs';

const SCHEMA_VERSION = 9;

let db: Database.Database | null = null;

function defaultDbPath(): string {
  const userData = app.getPath('userData');
  const dir = join(userData, 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'fundlog.db');
}

/** Resolved path used for the SQLite file (env → prefs → default). */
export function getResolvedDatabasePath(): string {
  const envOverride = process.env.FUNDLOG_DB_PATH?.trim();
  if (envOverride) {
    return envOverride;
  }

  const custom = readAppPrefs().databasePath?.trim();
  if (custom) {
    const resolved = normalize(custom);
    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return resolved;
  }

  return defaultDbPath();
}

export function getDatabaseLocationInfo(): {
  resolvedPath: string;
  customPath: string | null;
  envOverride: boolean;
} {
  const envOverride = Boolean(process.env.FUNDLOG_DB_PATH?.trim());
  const custom = readAppPrefs().databasePath?.trim() ?? null;
  return {
    resolvedPath: getResolvedDatabasePath(),
    customPath: custom,
    envOverride,
  };
}

function getDbPath(): string {
  return getResolvedDatabasePath();
}

export function closeDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

/** Close the current connection and open using the latest prefs / env. */
export function reloadDatabase(): void {
  closeDb();
  getDb();
}

export function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations();
  }
  return db;
}

function getCurrentVersion(): number {
  const row = getDb()
    .prepare(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
    )
    .get() as { version: number } | undefined;
  return row?.version ?? 0;
}

function ensureMigrationsTable() {
  getDb()
    .prepare(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`
    )
    .run();
}

function runMigrations() {
  ensureMigrationsTable();
  const current = getCurrentVersion();
  const dbInstance = getDb();

  if (current < 1 && SCHEMA_VERSION >= 1) {
    const now = new Date().toISOString();
    const ddl = `
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        currency_code TEXT NOT NULL,
        starting_month TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        start_month TEXT NOT NULL,
        end_month TEXT,
        monthly_income REAL NOT NULL,
        rule_set TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE budget_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        rule_key TEXT NOT NULL,
        target_percent REAL NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
      );

      CREATE TABLE budget_subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id INTEGER NOT NULL,
        parent_category_id INTEGER,
        label TEXT NOT NULL,
        target_percent REAL,
        target_amount REAL,
        is_flexible INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_category_id) REFERENCES budget_categories(id) ON DELETE SET NULL
      );

      CREATE TABLE goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        target_date TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE goal_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        subcategory_id INTEGER NOT NULL,
        percent REAL,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
        FOREIGN KEY (subcategory_id) REFERENCES budget_subcategories(id) ON DELETE CASCADE
      );

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        budget_id INTEGER,
        subcategory_id INTEGER,
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        merchant TEXT,
        description TEXT,
        source TEXT NOT NULL,
        goal_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
        FOREIGN KEY (subcategory_id) REFERENCES budget_subcategories(id) ON DELETE SET NULL,
        FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
      );

      CREATE TABLE receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER,
        file_path TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        ocr_status TEXT NOT NULL,
        expected_amount REAL,
        extracted_amount REAL,
        extracted_date TEXT,
        merchant TEXT,
        raw_ocr_text TEXT,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;

    dbInstance.exec(ddl);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      )
      .run(1, now);
  }

  if (current < 2 && SCHEMA_VERSION >= 2) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      ALTER TABLE budget_subcategories ADD COLUMN min_amount REAL;
      ALTER TABLE budget_subcategories ADD COLUMN max_amount REAL;
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      )
      .run(2, now);
  }

  if (current < 3 && SCHEMA_VERSION >= 3) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      CREATE TABLE credit_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        issuer TEXT,
        last_four TEXT,
        network TEXT,
        annual_fee REAL,
        benefits_notes TEXT,
        active_perk_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE credit_card_perks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        category_tags TEXT,
        cashback_detail TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
      );
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      )
      .run(3, now);
  }

  if (current < 4 && SCHEMA_VERSION >= 4) {
    const now = new Date().toISOString();
    dbInstance.exec(
      `ALTER TABLE goals ADD COLUMN show_on_dashboard INTEGER NOT NULL DEFAULT 1;`,
    );
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(4, now);
  }

  if (current < 5 && SCHEMA_VERSION >= 5) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      CREATE TABLE budget_month_income_boosts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        amount REAL NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_budget_month_income_boosts_budget_month
        ON budget_month_income_boosts(budget_id, month);
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(5, now);
  }

  if (current < 6 && SCHEMA_VERSION >= 6) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      ALTER TABLE budget_subcategories ADD COLUMN spread_months INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE budget_subcategories ADD COLUMN spread_start_month TEXT;
      ALTER TABLE transactions ADD COLUMN spread_months INTEGER NOT NULL DEFAULT 1;
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(6, now);
  }

  if (current < 7 && SCHEMA_VERSION >= 7) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      ALTER TABLE transactions ADD COLUMN entry_kind TEXT;
      UPDATE transactions
      SET entry_kind = 'unexpected'
      WHERE source = 'manual' AND goal_id IS NULL AND entry_kind IS NULL;
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(7, now);
  }

  if (current < 8 && SCHEMA_VERSION >= 8) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      CREATE TABLE portfolio_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        note TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        value REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (account_id, date),
        FOREIGN KEY (account_id) REFERENCES portfolio_accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_portfolio_snapshots_account_date
        ON portfolio_snapshots(account_id, date);
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(8, now);
  }

  if (current < 9 && SCHEMA_VERSION >= 9) {
    const now = new Date().toISOString();
    dbInstance.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_profile_budget
        ON transactions(profile_id, budget_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_profile_date
        ON transactions(profile_id, date);
      CREATE INDEX IF NOT EXISTS idx_transactions_budget_date
        ON transactions(budget_id, date);
      CREATE INDEX IF NOT EXISTS idx_transactions_goal_id
        ON transactions(goal_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_profile
        ON budgets(profile_id);
      CREATE INDEX IF NOT EXISTS idx_goals_profile
        ON goals(profile_id);
      CREATE INDEX IF NOT EXISTS idx_credit_cards_profile
        ON credit_cards(profile_id);
      CREATE INDEX IF NOT EXISTS idx_portfolio_accounts_profile
        ON portfolio_accounts(profile_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_transaction
        ON receipts(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_budget_categories_budget
        ON budget_categories(budget_id);
      CREATE INDEX IF NOT EXISTS idx_budget_subcategories_budget
        ON budget_subcategories(budget_id);
      CREATE INDEX IF NOT EXISTS idx_credit_card_perks_card
        ON credit_card_perks(card_id);
      CREATE INDEX IF NOT EXISTS idx_goal_allocations_goal
        ON goal_allocations(goal_id);
    `);
    dbInstance
      .prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      )
      .run(9, now);
  }
}

