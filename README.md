## Fundlog

Fundlog is a desktop application built with Electron, Vite, and Vue 3 for tracking and visualising funding- or finance-related data. It uses SQLite (via `better-sqlite3`) for fast local storage and `chart.js` / `vue-chartjs` for interactive charts.

### Features

- **Desktop-first app**: Packaged and run as a native desktop application with Electron Forge.
- **Modern frontend**: Built using Vue 3, Vite, Pinia, and Vue Router.
- **Local database**: Uses `better-sqlite3` for a local, file-based database (no external DB server required).
- **Charts & analytics**: Visualisations powered by `chart.js` and `vue-chartjs`.
- **Notifications**: Toasts and inline feedback using `vue-toastification`.

### Prerequisites

- **Node.js**: Recommended LTS version (18+).
- **Git**: To clone the repository.
- **npm**: Comes with Node; used for dependency management and scripts.

### Getting Started

1. **Clone the repository**

```bash
git clone https://github.com/<your-username>/fundlog-forge.git
cd fundlog-forge
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

- **Database location**: The app uses `better-sqlite3` to access a local SQLite database file; check the Electron main process code for the exact path and schema.
- **Environment configuration**: If you add environment-specific behaviour, prefer Electron Forge / Vite environment variables (e.g. `.env`, `.env.development`) and keep secrets out of version control.
- **Packaging**: When changing Electron/Forge configuration (makers, plugins, fuses), update `README.md` so the setup instructions stay accurate.

### License

This project is licensed under the **MIT License**. See the license information in `package.json` or an accompanying `LICENSE` file if present.
