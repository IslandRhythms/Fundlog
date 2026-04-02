<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDomainStore } from '../stores/domain';
import type { Transaction, Receipt } from '../shared/types';

const domain = useDomainStore();
const router = useRouter();

const loading = ref(false);
const receiptMap = ref<Record<number, Receipt[]>>({});
const statusMessage = ref<string | null>(null);

const transactions = computed(() =>
  [...domain.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

async function ensureDataLoaded() {
  loading.value = true;
  try {
    if (!domain.activeProfileId) {
      await domain.loadProfiles();
    } else {
      await domain.loadTransactions();
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void ensureDataLoaded();
});

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
      Review your transactions and attach receipt images for easier verification.
    </p>

    <div class="mb-3 d-flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        @click="goTo('/import-export')"
      >
        Import / export CSV
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        @click="goTo('/expenses')"
      >
        Plan expenses for this budget
      </button>
    </div>

    <p v-if="loading" class="status-text">Loading transactions…</p>
    <p v-else-if="!domain.transactions.length" class="status-text">
      No transactions yet. Create a budget and add some activity to see them here.
    </p>

    <div v-if="transactions.length" class="transactions-table-wrapper mt-3">
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
</template>

