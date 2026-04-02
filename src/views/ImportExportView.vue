<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDomainStore } from '../stores/domain';

const domain = useDomainStore();

const rawCsv = ref('');
const importStatus = ref<string | null>(null);
const exportStatus = ref<string | null>(null);

const canImport = computed(
  () => !!domain.activeProfileId && !!domain.activeBudgetId && !!rawCsv.value.trim()
);
const canExport = computed(() => !!domain.activeProfileId);

type ParsedRow = {
  date: string;
  amount: number;
  merchant?: string | null;
  description?: string | null;
};

function parseSimpleCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const findIndex = (names: string[]) =>
    headers.findIndex((h) => names.includes(h));

  const dateIdx = findIndex(['date']);
  const amountIdx = findIndex(['amount', 'amt']);
  const descIdx = findIndex(['description', 'desc', 'details']);
  const merchantIdx = findIndex(['merchant', 'payee']);

  const rows: ParsedRow[] = [];
  for (const line of dataLines) {
    const cols = line.split(',');
    const date = dateIdx >= 0 ? cols[dateIdx]?.trim() : '';
    const amountRaw = amountIdx >= 0 ? cols[amountIdx]?.trim() : '';
    const amount = Number(amountRaw);
    if (!date || !Number.isFinite(amount)) continue;
    rows.push({
      date,
      amount,
      merchant: merchantIdx >= 0 ? cols[merchantIdx]?.trim() || null : null,
      description: descIdx >= 0 ? cols[descIdx]?.trim() || null : null,
    });
  }
  return rows;
}

async function doImport() {
  importStatus.value = null;
  if (!domain.activeProfileId || !domain.activeBudgetId) return;
  const rows = parseSimpleCsv(rawCsv.value);
  if (!rows.length) {
    importStatus.value = 'No valid rows found in CSV.';
    return;
  }
  try {
    await window.fundlog.csv.importTransactions({
      profileId: domain.activeProfileId,
      budgetId: domain.activeBudgetId,
      rows,
    });
    await domain.loadTransactions();
    importStatus.value = `Imported ${rows.length} row(s) into the current budget.`;
    rawCsv.value = '';
  } catch (err) {
    console.error(err);
    importStatus.value = 'Failed to import CSV.';
  }
}

async function doExport() {
  exportStatus.value = null;
  if (!domain.activeProfileId) return;
  try {
    const result = await window.fundlog.csv.exportTransactions({
      profileId: domain.activeProfileId,
      budgetId: domain.activeBudgetId ?? null,
    });
    if (!result.count) {
      exportStatus.value = 'No transactions to export for the current selection.';
      return;
    }
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exportStatus.value = `Exported ${result.count} transaction(s) to CSV.`;
  } catch (err) {
    console.error(err);
    exportStatus.value = 'Failed to export CSV.';
  }
}
</script>

<template>
  <div class="view import-export-view container-fluid">
    <h2 class="mb-2">Import / Export</h2>
    <p class="view-intro mb-4">
      Import transactions from CSV or export your current transactions as a CSV file.
    </p>

    <div class="row g-3">
      <div class="col-lg-7">
        <section class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title">Import CSV</h3>
            <p class="small text-muted mb-2">
              Paste a CSV where the first row is a header containing at least
              <code>date</code> and <code>amount</code> columns.
            </p>
            <textarea
              v-model="rawCsv"
              class="form-control mb-2"
              rows="10"
              placeholder="date,amount,description,merchant&#10;2025-01-01,12.34,Coffee,Local Cafe"
            />
            <button
              type="button"
              class="btn btn-primary"
              :disabled="!canImport"
              @click="doImport"
            >
              Import into current budget
            </button>
            <p v-if="importStatus" class="status-text mt-2">
              {{ importStatus }}
            </p>
          </div>
        </section>
      </div>
      <div class="col-lg-5">
        <section class="card h-100">
          <div class="card-body">
            <h3 class="h5 card-title">Export CSV</h3>
            <p class="small text-muted">
              Export transactions for the active profile
              <span v-if="domain.activeBudget">and current budget</span>.
            </p>
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="!canExport"
              @click="doExport"
            >
              Download CSV
            </button>
            <p v-if="exportStatus" class="status-text mt-2">
              {{ exportStatus }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

