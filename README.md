## Fundlog

Fundlog is a desktop application built with Electron, Vite, and Vue 3 for tracking and visualising funding- or finance-related data. It uses SQLite (via `better-sqlite3`) for fast local storage and `chart.js` / `vue-chartjs` for interactive charts.

### Features

- **Desktop-first app**: Packaged and run as a native desktop application with Electron Forge.
- **Modern frontend**: Built using Vue 3, Vite, Pinia, and Vue Router.
- **Local database**: Uses `better-sqlite3` for a local, file-based database (no external DB server required). Optional custom database path and export from **Settings → Data & sync**. Custom paths must be chosen via the native file dialog (not typed freely). Foreign keys are enforced (`PRAGMA foreign_keys = ON`).
- **Backup reminders**: In **Settings → Data & sync**, set “Remind every N days” (default 7; `0` = off). A successful export records `lastBackupAt`. When a backup is overdue, a dismissible banner at the top of the main content offers **Export now** (same safe SQLite copy as Settings).
- **Charts & analytics**: Visualisations powered by `chart.js` and `vue-chartjs`.
- **Notifications**: Toasts and inline feedback using `vue-toastification`.
- **Theme support**: Light, dark, or system appearance from **Settings**, with correct preference vs. resolved mode for the sidebar toggle. **Custom colors** (optional): override page, card, text, accent, and related CSS variables; saved in `fundlog-app-prefs.json` in the app user data folder alongside other app preferences.
- **Shell & navigation**: Rounded sidebar and main content panel, single scroll area in the main column on large screens, and a grouped sidebar (Overview, Activity, Budgets, Planning, Finances) with **Settings** and **Light/Dark** in an App section at the bottom. **Planning** includes **Goals**, **Expenses**, and **Extra income**. **Finances** includes **Portfolio Snapshot** and **Cards**.
- **Portfolio Snapshot**: Under **Finances**, track named portfolio accounts (brokerage, retirement, cash, etc.) with **one value per account per calendar day** (logging again on the same day updates that day’s amount). Each account shows a line chart of value over time, dollar and % change since the previous and first entries, and high/low. A page total uses **carry-forward** (last known value per account as of the latest snapshot day) and compares that to the prior day that had any snapshot data. The per-account **history** modal can filter snapshots by date range.
- **Extra income (monthly bumps)**: A **Planning → Extra income** page records one-off additions for a chosen calendar month (e.g. an extra shift or bonus) against the **active budget**. They do not change the base monthly income on **Budgets**; instead, **effective income** for *this calendar month* is base + extras. **Dashboard**, **Goals** (this month’s income & commitments), **Budgets** (planned / unexpected percentages and bars), and **Expenses** (summary %) all use that effective total so short-term income shows up everywhere the plan is compared to income.
- **Budgets with 50/30/20 split**: Create budgets with monthly income and see both percentage and dollar allocations for Needs / Wants / Savings & Debt.
- **Budgets workflow**: Toolbar actions for **New budget**, **Extra income**, and **Start clean month** (when a budget is active). **Your budgets** is a collapsible list of saved budgets. **Start clean month** opens a confirmation modal that explains what is kept vs. removed before you pick a calendar month and confirm.
- **Budget Records**: A dedicated page lists every budget with start/end period, **base** monthly income (not per-month **Extra income** bumps), **lifetime total logged**, transaction count, rule type, and a short “vs income” note; the table scrolls horizontally on narrow layouts and scales to full width when space allows.
- **Credit cards**: Under **Finances → Cards**, track issuers, last four, annual fee, benefits notes, and **perks** (labels, categories, cashback or deal text) with an optional **active** perk. You can add an optional **first perk** while creating a card or manage perks from each card.
- **Planned expenses**: For each budget, configure fixed and variable expenses within 50/30/20 categories, with per-expense and overall progress bars showing share of income. Percentages use **this month’s effective income** when you have logged **Extra income** for the current month. Multi-month recurring lines can set an optional **due day** (1–31); **Budgets** shows upcoming dues for the next 30 days, and **Dashboard** shows a compact **Due soon** list when any exist (display only — no auto-created transactions).
- **Transactions**: The **Transactions** page loads data in pages (~50 rows) with **server-side** search (merchant/description), date from/to, and optional subcategory filters—not a client-side filter of the full history. Other screens (Dashboard, Budgets, Expenses, and related summaries) load **current-month** (or small recent) transaction sets where possible instead of all-time lists.
- **Custom category colors**: Each budget category can be assigned a custom color, used consistently in the dashboard pie chart, progress bars, and expense items.
- **Unexpected expenses tracking**: A dedicated **Expenses** page lets you log unexpected items (with required label and category), and summarizes how they impact the budget versus the planned amounts. Summary percentages use the same **effective monthly income** (base + **Extra income** for the current calendar month) as the rest of the app. Activity lists support a light **client-side search** (label/merchant) over the month-scoped data already loaded.
- **Dashboard overview**: A dashboard summarising current budget, planned vs unexpected expenses, 50/30/20 allocation, recent transactions, and top goals. When recurring planned lines have dues in the next 30 days, a compact **Due soon** strip appears. When **Extra income** applies to the current month, the overview calls that out and links to the Extra income page.
- **Goals**: Set savings targets with optional deadlines, priority, notes, and **Show on dashboard** (up to three by priority on the Dashboard). The **Goals** page treats monthly budgeting like a “fuel” meter: **income** (effective for the current month) minus **committed** planned + unexpected spending equals **headroom**, with a ring visualization and category bar. Each goal can show saved progress (from transactions linked to that goal when used), deadline **pace** vs. headroom, and an **Edit goal** flow (including target date). Links to **Extra income** and **Budgets** keep the story connected.
- **Modal-based create flows**: Creating budgets, profiles, goals, cards, perks, and unexpected expenses is handled via Bootstrap modals where appropriate, keeping pages focused on data views. Modals are **centered** and **scrollable** so long forms stay usable on short or small windows (including when a `<form>` wraps the modal body).
- **Errors & validation**: Goal and extra-income operations surface clear messages from the data layer (validation and SQLite failures) in toasts instead of failing silently; shared helpers normalize IPC/repository errors for readable copy.

### Prerequisites

- **Node.js**: Recommended LTS version (18+).
- **Git**: To clone the repository.
- **npm**: Comes with Node; used for dependency management and scripts.

### Getting Started

1. **Clone the repository**

```bash
git clone https://github.com/<your-username>/fundlog.git
cd fundlog
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the app in development mode**

```bash
npm start
```

This will start the Vite dev server and launch the Electron application window.

### Building Packages

To create distributable binaries (platform-specific installers/archives), use Electron Forge’s scripts:

- **Package (unpackaged app bundles)**:

```bash
npm run package
```

- **Make (installers/DMG/EXE/etc.)**:

```bash
npm run make
```

The outputs are placed in the `out` directory that Electron Forge manages.

### Project Structure (overview)

- **`package.json`**: Project metadata, npm scripts, and dependencies.
- **`.vite/`**: Vite build artifacts (generated).
- **`src/`**: Main source code for the Electron main process and Vue frontend (exact layout may vary).
- **`node_modules/`**: Installed dependencies (generated).

### Available npm Scripts

From `package.json`:

- **`npm start`**: Run the app in development mode with hot reload.
- **`npm run package`**: Package the app without making installers.
- **`npm run make`**: Build platform-specific installers using Electron Forge.
- **`npm run publish`**: Publish artifacts using Electron Forge (requires configuration).
- **`npm run lint`**: Run ESLint on TypeScript and Vue source files.

### Tech Stack

- **Runtime**: Electron 41
- **Bundler/Dev server**: Vite 5
- **Frontend framework**: Vue 3
- **State management**: Pinia
- **Routing**: Vue Router
- **Charts**: Chart.js + Vue Chart.js
- **Database**: better-sqlite3 (SQLite)
- **Linting**: ESLint with TypeScript support

### Development Notes

- **Database location**: The app uses `better-sqlite3` to access a local SQLite database file; defaults and overrides are described in **Settings** and in the main-process DB helpers. Schema migrations (goals, extra monthly income, portfolio accounts/snapshots, query indexes, budget subcategory `due_day`, etc.) run automatically on startup via `main-process/db.ts`. Foreign keys are enabled on every open.
- **App preferences**: `fundlog-app-prefs.json` in Electron’s `userData` directory can store `databasePath`, `customTheme`, `backupReminderDays`, `lastBackupAt`, and related fields (see `main-process/app-prefs.ts` and `preferences:*` IPC).
- **Branding**: To use a custom sidebar logo, add an image under `src/assets/` and reference it from `App.vue` (replacing or wrapping the default letter mark in the sidebar header).
- **Environment configuration**: If you add environment-specific behaviour, prefer Electron Forge / Vite environment variables (e.g. `.env`, `.env.development`) and keep secrets out of version control.
- **Packaging**: When changing Electron/Forge configuration (makers, plugins, fuses), update `README.md` so the setup instructions stay accurate.

### License

This project is licensed under the **MIT License**. See the license information in `package.json` or an accompanying `LICENSE` file if present.
