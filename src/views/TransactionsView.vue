<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import { formatMoney as formatMoneyExact } from '../shared/formatMoney';
import type { Transaction, Receipt } from '../shared/types';

const domain = useDomainStore();
const router = useRouter();
const toast = useToast();

const loading = ref(false);
const receiptMap = ref<Record<number, Receipt[]>>({});
const statusMessage = ref<string | null>(null);

const rawCsv = ref('');
const importStatus = ref<string | null>(null);
const exportStatus = ref<string | null>(null);

const newDate = ref(new Date().toISOString().slice(0, 10));
const newAmount = ref<number | null>(null);
const newMerchant = ref('');
const newDescription = ref('');
const addingTransaction = ref(false);

const canAddTransaction = computed(
  () =>
    !!domain.activeProfileId &&
    !!domain.activeBudgetId &&
    !!newDate.value &&
    newAmount.value != null &&
    newAmount.value > 0,
);

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
    }
    await domain.loadBudgets();
    await domain.loadTransactions();
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
    hideBsModal('importCsvModal');
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
    hideBsModal('exportCsvModal');
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
  const code = domain.profiles.find((p) => p.id === domain.activeProfileId)?.currencyCode ?? 'USD';
  return formatMoneyExact(amount, code);
}

function resetAddForm() {
  newDate.value = new Date().toISOString().slice(0, 10);
  newAmount.value = null;
  newMerchant.value = '';
  newDescription.value = '';
}

async function addTransaction() {
  if (!canAddTransaction.value || !domain.activeProfileId || !domain.activeBudgetId) return;
  addingTransaction.value = true;
  try {
    await window.fundlog.transaction.createSingle({
      profileId: domain.activeProfileId,
      budgetId: domain.activeBudgetId,
      date: newDate.value,
      amount: newAmount.value!,
      merchant: newMerchant.value.trim() || null,
      description: newDescription.value.trim() || null,
    });
    await domain.loadTransactions();
    resetAddForm();
    hideBsModal('addTransactionModal');
    toast.success('Transaction added.');
  } catch (err) {
    console.error(err);
    toast.error('Could not add transaction.');
  } finally {
    addingTransaction.value = false;
  }
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
      Add transactions one at a time, or use Import / Export when you need CSV.
    </p>

    <p v-if="!domain.activeBudget" class="status-text mb-3">
      Select a budget to add or view transactions.
    </p>

    <div class="mb-4 d-flex flex-wrap gap-2 align-items-center">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        data-bs-toggle="modal"
        data-bs-target="#addTransactionModal"
        :disabled="!domain.activeBudgetId"
      >
        Add transaction…
      </button>
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
      No transactions yet. Use Add transaction… or Import CSV… above.
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
    id="addTransactionModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="addTransactionModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addTransactionModalLabel" class="modal-title">Add transaction</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <form @submit.prevent="addTransaction">
          <div class="modal-body row g-3">
            <div class="col-6">
              <label class="form-label">
                Date
                <input v-model="newDate" type="date" class="form-control" required />
              </label>
            </div>
            <div class="col-6">
              <label class="form-label">
                Amount
                <input
                  v-model.number="newAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  class="form-control"
                  placeholder="0.00"
                  required
                />
              </label>
            </div>
            <div class="col-12">
              <label class="form-label">
                Merchant
                <input
                  v-model="newMerchant"
                  type="text"
                  class="form-control"
                  placeholder="Store or payee"
                />
              </label>
            </div>
            <div class="col-12">
              <label class="form-label">
                Description
                <input
                  v-model="newDescription"
                  type="text"
                  class="form-control"
                  placeholder="What it was for"
                />
              </label>
            </div>
            <div class="col-12">
              <p class="small text-muted mb-0">
                Saved to the active budget. For purchases or unexpected expenses tied to your plan,
                use <a href="#" @click.prevent="goTo('/expenses')">Expenses</a>.
              </p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="!canAddTransaction || addingTransaction">
              {{ addingTransaction ? 'Saving…' : 'Add transaction' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <div
    id="importCsvModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="importCsvModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
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
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
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
