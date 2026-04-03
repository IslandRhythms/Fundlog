<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import type { Transaction, Receipt } from '../shared/types';

const domain = useDomainStore();
const router = useRouter();

const loading = ref(false);
const receiptMap = ref<Record<number, Receipt[]>>({});
const statusMessage = ref<string | null>(null);

const rawCsv = ref('');
const importStatus = ref<string | null>(null);
const exportStatus = ref<string | null>(null);

const transactions = computed(() =>
  [...domain.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);

const canImport = computed(
  () => !!domain.activeProfileId && !!domain.activeBudgetId && !!rawCsv.value.trim(),
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

async function ensureDataLoaded() {
  loading.value = true;
  try {
    if (!domain.activeProfileId) {
      await domain.loadProfiles();
    } else {
      await domain.loadBudgets();
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void ensureDataLoaded();
});

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

async function attachReceipt(tx: Transaction) {
  statusMessage.value = null;
  try {
    const receipt = await window.fundlog.receipt.attachViaDialog({
      transactionId: tx.id,
      expectedAmount: tx.amount,
      merchant: tx.merchant ?? undefined,
    });
    if (!receipt) {
      statusMessage.value = 'Receipt selection canceled.';
      return;
    }
    const existing = receiptMap.value[tx.id] ?? [];
    receiptMap.value = {
      ...receiptMap.value,
      [tx.id]: [receipt, ...existing],
    };
    statusMessage.value = 'Receipt attached.';
  } catch (err) {
    console.error(err);
    statusMessage.value = 'Failed to attach receipt.';
  }
}

async function loadReceipts(tx: Transaction) {
  statusMessage.value = null;
  try {
    const receipts = await window.fundlog.receipt.listByTransaction(tx.id);
    receiptMap.value = {
      ...receiptMap.value,
      [tx.id]: receipts,
    };
  } catch (err) {
    console.error(err);
    statusMessage.value = 'Failed to load receipts.';
  }
}

function formatAmount(amount: number) {
  return amount.toFixed(2);
}

async function runOcr(tx: Transaction, receipt: Receipt) {
  statusMessage.value = null;
  try {
    const updated = await window.fundlog.receipt.runFakeOcr({
      receiptId: receipt.id,
      transactionAmount: tx.amount ?? null,
      transactionDate: tx.date ?? null,
      transactionMerchant: tx.merchant ?? null,
    });
    const existing = receiptMap.value[tx.id] ?? [];
    receiptMap.value = {
      ...receiptMap.value,
      [tx.id]: existing.map((r) => (r.id === updated.id ? updated : r)),
    };
    statusMessage.value = 'OCR analysis updated from transaction data.';
  } catch (err) {
    console.error(err);
    statusMessage.value = 'Failed to run OCR.';
  }
}

function isMismatched(receipt: Receipt) {
  if (
    receipt.expectedAmount != null &&
    receipt.extractedAmount != null &&
    receipt.expectedAmount !== receipt.extractedAmount
  ) {
    return true;
  }
  return false;
}

function goTo(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="view transactions-view container-fluid">
    <h2 class="mb-2">Transactions</h2>
    <p class="view-intro mb-3">
      Use Import or Export when you need CSV; otherwise review activity and receipts below.
    </p>

    <div class="mb-4 d-flex flex-wrap gap-2 align-items-center">
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        data-bs-toggle="modal"
        data-bs-target="#importCsvModal"
      >
        Import CSV…
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        data-bs-toggle="modal"
        data-bs-target="#exportCsvModal"
      >
        Export CSV…
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        @click="goTo('/expenses')"
      >
        Plan expenses for this budget
      </button>
    </div>

    <h3 class="h5 mb-3">Activity</h3>
    <LoadingView v-if="loading" class="mb-3" message="Loading transactions…" />
    <p v-else-if="!domain.transactions.length" class="status-text">
      No transactions yet. Use Import CSV… or add activity from the Expenses view.
    </p>

    <div v-if="transactions.length" class="transactions-table-wrapper mt-2">
      <table class="transactions-table table table-dark table-striped table-sm align-middle">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Merchant</th>
            <th scope="col">Description</th>
            <th scope="col" class="text-end">Amount</th>
            <th scope="col">Source</th>
            <th scope="col">Receipts</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id">
            <td>{{ tx.date }}</td>
            <td>{{ tx.merchant || '—' }}</td>
            <td>{{ tx.description || '—' }}</td>
            <td class="text-end">
              {{ formatAmount(tx.amount) }}
            </td>
            <td>{{ tx.source }}</td>
            <td class="receipts-cell">
              <div class="receipts-actions mb-1 d-flex gap-1">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-light"
                  @click="attachReceipt(tx)"
                >
                  Attach receipt
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  @click="loadReceipts(tx)"
                >
                  View
                </button>
              </div>
              <div v-if="receiptMap[tx.id]?.length" class="receipts-preview d-flex flex-wrap gap-1">
                <div
                  v-for="r in receiptMap[tx.id]"
                  :key="r.id"
                  class="receipt-pill badge rounded-pill text-bg-success"
                  :class="{ 'receipt-pill-mismatch': isMismatched(r) }"
                >
                  <a
                    :href="`file://${r.filePath}`"
                    target="_blank"
                    rel="noreferrer"
                    class="text-decoration-none text-reset"
                  >
                    {{ new Date(r.uploadedAt).toLocaleDateString() }}
                  </a>
                  <span class="receipt-meta ms-1">
                    <span v-if="r.expectedAmount != null">
                      exp {{ formatAmount(r.expectedAmount) }}
                    </span>
                    <span v-if="r.extractedAmount != null">
                      · ocr {{ formatAmount(r.extractedAmount) }}
                    </span>
                  </span>
                  <button
                    type="button"
                    class="btn btn-xs btn-outline-light ms-1"
                    @click="runOcr(tx, r)"
                  >
                    Run OCR
                  </button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="statusMessage" class="status-text mt-2">
      {{ statusMessage }}
    </p>
  </div>

  <div
    id="importCsvModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="importCsvModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="importCsvModalLabel" class="modal-title">Import CSV</h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          ></button>
        </div>
        <div class="modal-body">
          <p class="small text-muted mb-2">
            Paste a CSV whose first row is a header with at least
            <code>date</code> and <code>amount</code> columns.
          </p>
          <textarea
            v-model="rawCsv"
            class="form-control mb-3 font-monospace small"
            rows="12"
            placeholder="date,amount,description,merchant&#10;2026-01-01,12.34,Coffee,Local Cafe"
          />
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!canImport"
            @click="doImport"
          >
            Import into current budget
          </button>
          <p v-if="importStatus" class="status-text mt-2 mb-0">
            {{ importStatus }}
          </p>
        </div>
      </div>
    </div>
  </div>

  <div
    id="exportCsvModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="exportCsvModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="exportCsvModalLabel" class="modal-title">Export CSV</h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          ></button>
        </div>
        <div class="modal-body">
          <p class="small text-muted mb-3">
            Download transactions for the active profile
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
          <p v-if="exportStatus" class="status-text mt-2 mb-0">
            {{ exportStatus }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
