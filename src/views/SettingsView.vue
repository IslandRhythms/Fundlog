<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import { useUiStore } from '../stores/ui';
import type { AppPrefs, CustomThemeColors } from '../shared/types';

const domain = useDomainStore();
const ui = useUiStore();
const toast = useToast();

const profileName = ref('');
const profileCurrency = ref('USD');
const profileStartingMonth = ref('');

const dbPathInput = ref('');
const dbLocation = ref<Awaited<
  ReturnType<typeof window.fundlog.database.getLocation>
> | null>(null);
const dbLocationLoading = ref(false);
const dbLocationSaving = ref(false);
const dbExporting = ref(false);

const customThemeEnabled = ref(false);
const customThemeSaving = ref(false);
let customColorsLoadedFromPrefs = false;

const customColors = reactive({
  bg: '#f8f9fa',
  shellBg: '#e5e7eb',
  cardBg: '#ffffff',
  cardText: '#111827',
  text: '#212529',
  textH: '#111827',
  muted: '#6b7280',
  border: '#e5e4e7',
  cardBorder: '#dee2e6',
  accent: '#aa3bff',
} as CustomThemeColors & Record<string, string>);

function cssColorToHex(value: string): string {
  const c = value.trim();
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (m) {
    const h = (n: string) => Number(n).toString(16).padStart(2, '0');
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  if (/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(c)) {
    if (c.length === 4 && c[0] === '#') {
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    return c;
  }
  return '#808080';
}

function snapshotThemeIntoCustomColors() {
  const s = getComputedStyle(document.documentElement);
  const pairs: [keyof CustomThemeColors, string][] = [
    ['bg', '--bg'],
    ['shellBg', '--shell-bg'],
    ['cardBg', '--card-bg'],
    ['cardText', '--card-text'],
    ['text', '--text'],
    ['textH', '--text-h'],
    ['muted', '--muted'],
    ['border', '--border'],
    ['cardBorder', '--card-border'],
    ['accent', '--accent'],
  ];
  for (const [key, cssVar] of pairs) {
    customColors[key] = cssColorToHex(s.getPropertyValue(cssVar));
  }
}

function loadCustomThemeForm(prefs: AppPrefs) {
  const cfg = prefs.customTheme;
  customThemeEnabled.value = cfg?.enabled ?? false;
  customColorsLoadedFromPrefs = !!(
    cfg?.enabled &&
    cfg.colors &&
    Object.keys(cfg.colors).length > 0
  );
  if (customColorsLoadedFromPrefs && cfg?.colors) {
    for (const k of Object.keys(customColors) as (keyof CustomThemeColors)[]) {
      const v = cfg.colors[k];
      if (v) customColors[k] = v;
    }
  } else {
    snapshotThemeIntoCustomColors();
  }
}

watch(customThemeEnabled, (enabled) => {
  if (!enabled) {
    customColorsLoadedFromPrefs = false;
  }
});

async function saveCustomTheme() {
  customThemeSaving.value = true;
  try {
    if (!customThemeEnabled.value) {
      await ui.saveCustomTheme(null);
      toast.success('Custom colors turned off.');
      return;
    }
    const colors: CustomThemeColors = {};
    for (const k of Object.keys(customColors) as (keyof CustomThemeColors)[]) {
      const v = customColors[k];
      if (v && String(v).trim()) colors[k] = String(v).trim();
    }
    await ui.saveCustomTheme({ enabled: true, colors });
    customColorsLoadedFromPrefs = true;
    toast.success('Custom theme saved.');
  } catch (e) {
    console.error(e);
    toast.error('Could not save theme.');
  } finally {
    customThemeSaving.value = false;
  }
}

async function clearCustomTheme() {
  customThemeSaving.value = true;
  try {
    customThemeEnabled.value = false;
    await ui.saveCustomTheme(null);
    snapshotThemeIntoCustomColors();
    toast.success('Restored default theme colors.');
  } catch (e) {
    console.error(e);
    toast.error('Could not reset theme.');
  } finally {
    customThemeSaving.value = false;
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await refreshDbLocation();
  const prefs = await window.fundlog.preferences.get();
  loadCustomThemeForm(prefs);
});

async function refreshDbLocation() {
  dbLocationLoading.value = true;
  try {
    const info = await window.fundlog.database.getLocation();
    dbLocation.value = info;
    dbPathInput.value = info.envOverride ? info.resolvedPath : (info.customPath ?? '');
  } finally {
    dbLocationLoading.value = false;
  }
}

async function browseDbSave() {
  const picked = await window.fundlog.database.pickPathSave();
  if (picked) dbPathInput.value = picked;
}

async function browseDbOpen() {
  const picked = await window.fundlog.database.pickPathOpen();
  if (picked) dbPathInput.value = picked;
}

async function applyDbPath() {
  if (dbLocation.value?.envOverride) return;
  dbLocationSaving.value = true;
  try {
    const trimmed = dbPathInput.value.trim();
    const result = await window.fundlog.database.setLocation(
      trimmed === '' ? null : trimmed,
    );
    if (result.ok === false) {
      toast.error(result.error);
      return;
    }
    toast.success('Database location updated. Reloading…');
    window.location.reload();
  } finally {
    dbLocationSaving.value = false;
  }
}

async function resetDbPathToDefault() {
  if (dbLocation.value?.envOverride) return;
  dbPathInput.value = '';
  dbLocationSaving.value = true;
  try {
    const result = await window.fundlog.database.setLocation(null);
    if (result.ok === false) {
      toast.error(result.error);
      await refreshDbLocation();
      return;
    }
    toast.success('Using default database location. Reloading…');
    window.location.reload();
  } finally {
    dbLocationSaving.value = false;
  }
}

async function exportDatabaseCopy() {
  dbExporting.value = true;
  try {
    const result = await window.fundlog.database.exportCopy();
    if (result.ok) {
      toast.success(`Database exported to ${result.path}`);
    } else if ('canceled' in result && result.canceled) {
      /* dialog dismissed */
    } else if ('error' in result) {
      toast.error(result.error);
    }
  } finally {
    dbExporting.value = false;
  }
}

const profiles = computed(() =>
  [...domain.profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);
const activeProfileId = computed(() => domain.activeProfileId);

const theme = computed({
  get: () => ui.theme,
  set: (value) => ui.setTheme(value),
});

async function submitProfile() {
  if (!profileName.value || !profileStartingMonth.value) return;
  await domain.createProfile({
    name: profileName.value.trim(),
    currencyCode: profileCurrency.value.trim() || 'USD',
    startingMonth: profileStartingMonth.value,
  });
  profileName.value = '';
  profileStartingMonth.value = '';
}
</script>

<template>
  <div class="view container-fluid">
    <h2 class="mb-2">Settings</h2>
    <p class="view-subtitle mb-4">
      Manage profiles, currency, and appearance preferences.
    </p>

    <div class="row g-3">
      <div class="col-12">
        <section v-if="profiles.length" class="card card-list stacked-section h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 card-title mb-0">Existing profiles</h3>
              <button
                class="btn btn-sm btn-primary"
                type="button"
                data-bs-toggle="modal"
                data-bs-target="#createProfileModal"
              >
                New profile
              </button>
            </div>
            <ul class="list-unstyled mt-3">
              <li
                v-for="p in profiles"
                :key="p.id"
                class="mb-2"
              >
                <div class="d-flex flex-column border rounded p-2 bg-dark bg-opacity-50">
                  <div class="d-flex align-items-center mb-1">
                    <span class="fw-semibold me-2">{{ p.name }}</span>
                    <span
                      v-if="p.id === activeProfileId"
                      class="badge bg-success"
                    >
                      Active
                    </span>
                  </div>
                  <div class="small text-muted d-flex flex-wrap gap-2">
                    <span>{{ p.currencyCode }}</span>
                    <span>From {{ p.startingMonth }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <div class="row g-3 mt-3">
      <div class="col-12">
        <section class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title mb-3">Data &amp; sync</h3>
            <p class="small text-muted mb-3">
              Your budget data is stored in a single SQLite file. You can put that file in a
              synced folder (for example Dropbox or OneDrive) so the same database path is
              used on each computer. Only one instance of Fundlog should use the file at a time.
              Cloud sync and SQLite can conflict if two devices write at once—close the app
              everywhere before relying on sync.
            </p>
            <div v-if="dbLocationLoading" class="mb-3">
              <LoadingView compact message="Loading database settings…" />
            </div>
            <template v-else-if="dbLocation">
              <div
                v-if="dbLocation.envOverride"
                class="alert alert-secondary small mb-3"
                role="status"
              >
                The active database path comes from the
                <code class="user-select-all">FUNDLOG_DB_PATH</code>
                environment variable. Changing it here is disabled until that variable is
                removed.
                <div class="mt-2 text-break user-select-all">
                  {{ dbLocation.resolvedPath }}
                </div>
              </div>
              <template v-else>
                <label class="form-label" for="db-path-input">
                  Database file path
                </label>
                <input
                  id="db-path-input"
                  v-model="dbPathInput"
                  type="text"
                  class="form-control font-monospace small mb-2"
                  placeholder="Default: app data folder"
                  autocomplete="off"
                  spellcheck="false"
                />
                <p class="small text-muted mb-2">
                  Currently open file:
                  <span class="text-break user-select-all">{{ dbLocation.resolvedPath }}</span>
                </p>
                <div class="d-flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    :disabled="dbLocationSaving"
                    @click="browseDbSave"
                  >
                    Choose location…
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    :disabled="dbLocationSaving"
                    @click="browseDbOpen"
                  >
                    Open existing file…
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="dbLocationSaving"
                    @click="applyDbPath"
                  >
                    Apply path
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    :disabled="dbLocationSaving || !dbLocation.customPath"
                    @click="resetDbPathToDefault"
                  >
                    Use default location
                  </button>
                </div>
              </template>

              <div class="border-top pt-3 mt-3">
                <h4 class="h6 mb-2">Backup</h4>
                <p class="small text-muted mb-2">
                  Save a snapshot of your data to another file (for example a USB drive or cloud
                  folder). Uses a safe SQLite backup while the app is running.
                </p>
                <button
                  type="button"
                  class="btn btn-outline-primary btn-sm"
                  :disabled="dbLocationSaving || dbExporting"
                  @click="exportDatabaseCopy"
                >
                  {{ dbExporting ? 'Exporting…' : 'Export database copy…' }}
                </button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>

    <div class="row g-3 mt-3">
      <div class="col-12">
        <section class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title mb-3">Appearance</h3>
            <div class="mb-3">
              <label class="form-label">
                Theme
                <select v-model="theme" class="form-select">
                  <option value="system">System default</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
            <p class="small text-muted mb-3">
              Theme changes update the app's background, cards, and text colors to keep everything readable.
            </p>
            <div class="border-top pt-3">
              <div class="form-check mb-3">
                <input
                  id="custom-theme-enabled"
                  v-model="customThemeEnabled"
                  class="form-check-input"
                  type="checkbox"
                />
                <label class="form-check-label" for="custom-theme-enabled">
                  Use custom colors
                </label>
              </div>
              <p class="small text-muted mb-3">
                Override the palette while keeping light, dark, or system mode. Saved in app preferences on this device.
              </p>
              <div v-if="customThemeEnabled" class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label small mb-1">Page background</label>
                  <input
                    v-model="customColors.bg"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Shell / sidebar</label>
                  <input
                    v-model="customColors.shellBg"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Card background</label>
                  <input
                    v-model="customColors.cardBg"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Card text</label>
                  <input
                    v-model="customColors.cardText"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Body text</label>
                  <input
                    v-model="customColors.text"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Headings</label>
                  <input
                    v-model="customColors.textH"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Muted text</label>
                  <input
                    v-model="customColors.muted"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Borders</label>
                  <input
                    v-model="customColors.border"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Card borders</label>
                  <input
                    v-model="customColors.cardBorder"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Accent</label>
                  <input
                    v-model="customColors.accent"
                    type="color"
                    class="form-control form-control-color w-100"
                  />
                </div>
              </div>
              <div class="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="customThemeSaving"
                  @click="saveCustomTheme"
                >
                  {{ customThemeSaving ? 'Saving…' : 'Save custom theme' }}
                </button>
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm"
                  :disabled="customThemeSaving"
                  @click="snapshotThemeIntoCustomColors"
                >
                  Copy colors from current theme
                </button>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  :disabled="customThemeSaving"
                  @click="clearCustomTheme"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <div
    class="modal fade"
    id="createProfileModal"
    tabindex="-1"
    aria-labelledby="createProfileModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="createProfileModalLabel">Create profile</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form @submit.prevent="submitProfile">
          <div class="modal-body row g-3">
            <div class="col-12">
              <label class="form-label">
                Profile name
                <input
                  v-model="profileName"
                  type="text"
                  class="form-control"
                  placeholder="Personal profile"
                />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Currency
                <input v-model="profileCurrency" type="text" class="form-control" placeholder="USD" />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Starting month
                <input v-model="profileStartingMonth" type="month" class="form-control" />
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              Cancel
            </button>
            <button class="btn btn-success" type="submit">
              Save profile
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

