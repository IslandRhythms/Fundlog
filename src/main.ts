import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  getDb,
  getDatabaseLocationInfo,
  getResolvedDatabasePath,
  reloadDatabase,
} from './main-process/db';
import { readAppPrefs, writeAppPrefs } from './main-process/app-prefs';
import {
  ProfileRepository,
  BudgetRepository,
  TransactionRepository,
  GoalRepository,
  CategoryRepository,
  ReceiptRepository,
  CreditCardRepository,
} from './main-process/repositories';
import type { AppPrefs, Transaction, Receipt } from './shared/types';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Fundlog',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', () => {
  getDb();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception in main process:', error);
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection in main process:', reason);
});

ipcMain.handle('theme:getState', () => ({
  preference: nativeTheme.themeSource,
  resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
}));

ipcMain.handle(
  'theme:set',
  (_event, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  },
);

ipcMain.handle('preferences:get', () => readAppPrefs());

ipcMain.handle('preferences:set', (_event, patch: Partial<AppPrefs>) => {
  const cur = readAppPrefs();
  const next: AppPrefs = { ...cur, ...patch };
  writeAppPrefs(next);
  return next;
});

ipcMain.handle('database:getLocation', () => {
  return getDatabaseLocationInfo();
});

ipcMain.handle('database:pickPathSave', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const defaultPath = path.join(app.getPath('documents'), 'fundlog.db');
  const r = await dialog.showSaveDialog(win ?? undefined, {
    title: 'Choose database file location',
    defaultPath,
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
});

ipcMain.handle('database:pickPathOpen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Select Fundlog database file',
    filters: [{ name: 'SQLite database', extensions: ['db'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle(
  'database:setLocation',
  (
    _event,
    args: { filePath: string | null },
  ): { ok: true } | { ok: false; error: string } => {
    if (process.env.FUNDLOG_DB_PATH?.trim()) {
      return {
        ok: false,
        error:
          'Database path is controlled by the FUNDLOG_DB_PATH environment variable.',
      };
    }
    const previous = readAppPrefs();
    try {
      if (args.filePath === null || args.filePath.trim() === '') {
        const next = { ...previous };
        delete next.databasePath;
        writeAppPrefs(next);
      } else {
        writeAppPrefs({
          ...previous,
          databasePath: path.normalize(args.filePath.trim()),
        });
      }
      reloadDatabase();
      return { ok: true };
    } catch (err) {
      writeAppPrefs(previous);
      try {
        reloadDatabase();
      } catch (revertErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to reopen database after reverting prefs:', revertErr);
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

ipcMain.handle(
  'database:exportCopy',
  async (
    event,
  ): Promise<
    | { ok: true; path: string }
    | { ok: false; canceled: true }
    | { ok: false; error: string }
  > => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const stamp = new Date().toISOString().slice(0, 10);
    const defaultPath = path.join(
      app.getPath('documents'),
      `fundlog-export-${stamp}.db`,
    );
    const r = await dialog.showSaveDialog(win ?? undefined, {
      title: 'Export database copy',
      defaultPath,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePath) {
      return { ok: false, canceled: true };
    }

    const dest = path.normalize(r.filePath.trim());
    const src = getResolvedDatabasePath();
    if (path.resolve(dest) === path.resolve(src)) {
      return {
        ok: false,
        error:
          'Choose a different path than the database file Fundlog is using.',
      };
    }

    try {
      await getDb().backup(dest);
      return { ok: true, path: dest };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
);

ipcMain.handle('profile:list', () => {
  return ProfileRepository.list();
});

ipcMain.handle(
  'profile:create',
  (_event, input: { name: string; currencyCode: string; startingMonth: string }) => {
    return ProfileRepository.create(input);
  },
);

ipcMain.handle(
  'budget:listByProfile',
  (_event, args: { profileId: number }) => {
    return BudgetRepository.listByProfile(args.profileId);
  },
);

ipcMain.handle(
  'budget:create',
  (
    _event,
    args: {
      profileId: number;
      name: string;
      startMonth: string;
      monthlyIncome: number;
      ruleSet: string;
    },
  ) => {
    const budget = BudgetRepository.create({
      profileId: args.profileId,
      name: args.name,
      startMonth: args.startMonth,
      monthlyIncome: args.monthlyIncome,
      ruleSet: args.ruleSet,
      isActive: true,
    });
    CategoryRepository.ensureDefaultRuleCategories(budget.id, budget.ruleSet);
    return budget;
  },
);

ipcMain.handle(
  'category:listByBudget',
  (_event, args: { budgetId: number }) => {
    return CategoryRepository.listByBudget(args.budgetId);
  },
);

ipcMain.handle(
  'category:updateColor',
  (
    _event,
    args: {
      id: number;
      color: string;
      budgetId: number;
    },
  ) => {
    return CategoryRepository.updateColor(args);
  },
);

ipcMain.handle(
  'subcategory:create',
  (
    _event,
    args: {
      budgetId: number;
      parentCategoryId: number | null;
      label: string;
      targetPercent?: number | null;
      targetAmount?: number | null;
      minAmount?: number | null;
      maxAmount?: number | null;
      isFlexible: boolean;
      sortOrder?: number;
    },
  ) => {
    return CategoryRepository.createSubcategory(args);
  },
);

ipcMain.handle(
  'transaction:listByBudget',
  (_event, args: { profileId: number; budgetId: number | null }) => {
    return TransactionRepository.listByBudget(args.profileId, args.budgetId);
  },
);

ipcMain.handle(
  'transaction:listUnexpected',
  (_event, args: { profileId: number; budgetId: number }) => {
    return TransactionRepository.listUnexpected(args.profileId, args.budgetId);
  },
);

ipcMain.handle(
  'transaction:spendSummaryForBudget',
  (_event, args: { budgetId: number }) => {
    return TransactionRepository.spendSummaryForBudget(args.budgetId);
  },
);

ipcMain.handle(
  'transaction:clearForBudgetMonth',
  (
    _event,
    args: { budgetId: number; month: string },
  ): { deleted: number } => {
    const deleted = TransactionRepository.deleteForBudgetInMonth(
      args.budgetId,
      args.month,
    );
    return { deleted };
  },
);

ipcMain.handle(
  'card:listByProfile',
  (_event, args: { profileId: number }) => {
    return CreditCardRepository.listByProfile(args.profileId);
  },
);

ipcMain.handle(
  'card:create',
  (
    _event,
    args: {
      profileId: number;
      name: string;
      issuer?: string | null;
      lastFour?: string | null;
      network?: string | null;
      annualFee?: number | null;
      benefitsNotes?: string | null;
    },
  ) => {
    return CreditCardRepository.create(args);
  },
);

ipcMain.handle(
  'card:update',
  (
    _event,
    args: {
      id: number;
      name: string;
      issuer?: string | null;
      lastFour?: string | null;
      network?: string | null;
      annualFee?: number | null;
      benefitsNotes?: string | null;
    },
  ) => {
    return CreditCardRepository.update(args);
  },
);

ipcMain.handle('card:delete', (_event, args: { id: number }) => {
  CreditCardRepository.delete(args.id);
});

ipcMain.handle(
  'card:perk:create',
  (
    _event,
    args: {
      cardId: number;
      label: string;
      categoryTags?: string | null;
      cashbackDetail: string;
      sortOrder?: number;
    },
  ) => {
    return CreditCardRepository.createPerk(args);
  },
);

ipcMain.handle(
  'card:perk:update',
  (
    _event,
    args: {
      id: number;
      label: string;
      categoryTags?: string | null;
      cashbackDetail: string;
      sortOrder?: number;
    },
  ) => {
    return CreditCardRepository.updatePerk(args);
  },
);

ipcMain.handle('card:perk:delete', (_event, args: { perkId: number }) => {
  CreditCardRepository.deletePerk(args.perkId);
});

ipcMain.handle(
  'card:setActivePerk',
  (_event, args: { cardId: number; perkId: number | null }) => {
    return CreditCardRepository.setActivePerk(args.cardId, args.perkId);
  },
);

ipcMain.handle(
  'csv:importTransactions',
  (
    _event,
    args: {
      profileId: number;
      budgetId: number | null;
      rows: {
        date: string;
        amount: number;
        merchant?: string | null;
        description?: string | null;
      }[];
    },
  ) => {
    return TransactionRepository.createBulk({
      profileId: args.profileId,
      budgetId: args.budgetId,
      rows: args.rows,
    });
  },
);

ipcMain.handle(
  'csv:exportTransactions',
  (
    _event,
    args: { profileId: number; budgetId: number | null },
  ): { filename: string; csv: string; count: number } => {
    const rows = TransactionRepository.listByBudget(
      args.profileId,
      args.budgetId,
    ) as Transaction[];
    const header = [
      'date',
      'amount',
      'merchant',
      'description',
      'source',
    ].join(',');
    const lines = rows.map((tx) => {
      const escape = (value: string | null) => {
        if (value == null) return '';
        const v = value.replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      };
      return [
        tx.date,
        tx.amount.toString(),
        escape(tx.merchant),
        escape(tx.description),
        tx.source,
      ].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const filename = 'transactions-export.csv';
    return { filename, csv, count: rows.length };
  },
);

ipcMain.handle(
  'receipt:listByTransaction',
  (_event, args: { transactionId: number }) => {
    return ReceiptRepository.listByTransaction(args.transactionId);
  },
);

ipcMain.handle(
  'receipt:attachViaDialog',
  async (
    _event,
    args: {
      transactionId: number | null;
      expectedAmount?: number | null;
      merchant?: string | null;
    },
  ): Promise<Receipt | null> => {
    if (!mainWindow) return null;

    const fileDialog = await dialog.showOpenDialog(mainWindow, {
      title: 'Select receipt image',
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg'],
        },
      ],
      properties: ['openFile'],
    });

    if (!fileDialog || fileDialog.canceled || fileDialog.filePaths.length === 0) {
      return null;
    }

    const [sourcePath] = fileDialog.filePaths;
    const ext = path.extname(sourcePath) || '.png';
    const userData = app.getPath('userData');
    const receiptsDir = path.join(userData, 'receipts');
    const fileName = `receipt-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}${ext}`;
    const destPath = path.join(receiptsDir, fileName);

    const fs = await import('node:fs');
    if (!fs.existsSync(receiptsDir)) {
      fs.mkdirSync(receiptsDir, { recursive: true });
    }
    fs.copyFileSync(sourcePath, destPath);

    const receipt = ReceiptRepository.create({
      transactionId: args.transactionId,
      filePath: destPath,
      expectedAmount: args.expectedAmount ?? null,
      merchant: args.merchant ?? null,
    });

    return receipt;
  },
);

ipcMain.handle(
  'receipt:runFakeOcr',
  (
    _event,
    args: {
      receiptId: number;
      transactionAmount: number | null;
      transactionDate: string | null;
      transactionMerchant: string | null;
    },
  ): Receipt => {
    const extractedAmount = args.transactionAmount ?? null;
    const extractedDate = args.transactionDate ?? null;
    const merchant = args.transactionMerchant ?? null;
    const rawOcrText =
      'Stub OCR result: using transaction data as extracted fields.';

    return ReceiptRepository.updateOcrResult({
      id: args.receiptId,
      ocrStatus: 'success',
      extractedAmount,
      extractedDate,
      merchant,
      rawOcrText,
    });
  },
);

ipcMain.handle(
  'goal:listByProfile',
  (_event, args: { profileId: number }) => {
    return GoalRepository.listByProfile(args.profileId);
  },
);

ipcMain.handle(
  'goal:create',
  (
    _event,
    args: {
      profileId: number;
      name: string;
      targetAmount: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
      showOnDashboard?: boolean;
    },
  ) => {
    return GoalRepository.create(args);
  },
);

ipcMain.handle(
  'goal:update',
  (
    _event,
    args: {
      id: number;
      name?: string;
      targetAmount?: number;
      targetDate?: string | null;
      priority?: number;
      note?: string | null;
      showOnDashboard?: boolean;
    },
  ) => {
    return GoalRepository.update(args);
  },
);

ipcMain.handle(
  'transaction:createManual',
  (
    _event,
    args: {
      profileId: number;
      budgetId: number;
      subcategoryId: number | null;
      date: string;
      amount: number;
      description?: string | null;
    },
  ) => {
    return TransactionRepository.createManual(args);
  },
);
