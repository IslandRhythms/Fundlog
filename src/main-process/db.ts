import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const SCHEMA_VERSION = 2;

let db: Database.Database | null = null;

function getDbPath() {
  const override = process.env.FUNDLOG_DB_PATH;
  if (override) {
    return override;
  }

  const userData = app.getPath('userData');
  const dir = join(userData, 'data');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'fundlog.db');
}

export function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
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
}

