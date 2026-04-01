<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useDomainStore } from '../stores/domain';
import type { Transaction, Receipt } from '../shared/types';

const domain = useDomainStore();

const loading = ref(false);
const receiptMap = ref<Record<number, Receipt[]>>({});
const statusMessage = ref<string | null>(null);

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
</script>

<template>
  <div class="view transactions-view">
    <h2>Transactions</h2>
    <p class="view-intro">
      Review your transactions and attach receipt images for easier verification.
    </p>

    <p v-if="loading" class="status-text">Loading transactions…</p>
    <p v-else-if="!domain.transactions.length" class="status-text">
      No transactions yet. Create a budget and add some activity to see them here.
    </p>

    <div v-if="domain.transactions.length" class="transactions-table-wrapper">
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Description</th>
            <th class="numeric">Amount</th>
            <th>Source</th>
            <th>Receipts</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in domain.transactions" :key="tx.id">
            <td>{{ tx.date }}</td>
            <td>{{ tx.merchant || '—' }}</td>
            <td>{{ tx.description || '—' }}</td>
            <td class="numeric">
              {{ formatAmount(tx.amount) }}
            </td>
            <td>{{ tx.source }}</td>
            <td class="receipts-cell">
              <div class="receipts-actions">
                <button
                  type="button"
                  class="small-button"
                  @click="attachReceipt(tx)"
                >
                  Attach receipt
                </button>
                <button
                  type="button"
                  class="small-button ghost"
                  @click="loadReceipts(tx)"
                >
                  View
                </button>
              </div>
              <div v-if="receiptMap[tx.id]?.length" class="receipts-preview">
                <div
                  v-for="r in receiptMap[tx.id]"
                  :key="r.id"
                  class="receipt-pill"
                  :class="{ 'receipt-pill-mismatch': isMismatched(r) }"
                >
                  <a
                    :href="`file://${r.filePath}`"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {{ new Date(r.uploadedAt).toLocaleDateString() }}
                  </a>
                  <span class="receipt-meta">
                    <span v-if="r.expectedAmount != null">
                      exp {{ formatAmount(r.expectedAmount) }}
                    </span>
                    <span v-if="r.extractedAmount != null">
                      · ocr {{ formatAmount(r.extractedAmount) }}
                    </span>
                  </span>
                  <button
                    type="button"
                    class="tiny-button"
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

    <p v-if="statusMessage" class="status-text">
      {{ statusMessage }}
    </p>
  </div>
</template>

