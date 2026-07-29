<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import PortfolioValueLineChart from '../components/PortfolioValueLineChart.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal, showBsModal } from '../shared/hideBsModal';
import { formatMoney, formatPercent } from '../shared/formatMoney';
import { errorMessageFromUnknown } from '../shared/errors';
import {
  accountValueStats,
  portfolioTotalStats,
  type AccountValueStats,
  type ValueChange,
} from '../shared/portfolioStats';
import type { PortfolioAccount, PortfolioSnapshot } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const accounts = ref<PortfolioAccount[]>([]);
const loading = ref(false);

const accountName = ref('');
const accountNote = ref('');
const editingAccount = ref<PortfolioAccount | null>(null);

const logAccountId = ref<number | null>(null);
const logDate = ref(todayIso());
const logValue = ref<number | null>(null);

const editingSnapshot = ref<{
  accountId: number;
  snapshot: PortfolioSnapshot;
} | null>(null);
const editSnapDate = ref('');
const editSnapValue = ref<number | null>(null);

const historyAccount = ref<PortfolioAccount | null>(null);
const historyDateFrom = ref('');
const historyDateTo = ref('');

const filteredHistorySnapshots = computed(() => {
  if (!historyAccount.value) return [];
  let snaps = [...historyAccount.value.snapshots].reverse();
  const from = historyDateFrom.value.trim();
  const to = historyDateTo.value.trim();
  if (from) snaps = snaps.filter((s) => s.date >= from);
  if (to) snaps = snaps.filter((s) => s.date <= to);
  return snaps;
});

const activeProfileId = computed(() => domain.activeProfileId);
const currencyCode = computed(
  () => domain.activeProfile?.currencyCode?.trim() || 'USD',
);

const totalStats = computed(() => portfolioTotalStats(accounts.value));

const accountStatsById = computed(() => {
  const map = new Map<number, AccountValueStats>();
  for (const account of accounts.value) {
    map.set(account.id, accountValueStats(account));
  }
  return map;
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(amount: number): string {
  return formatMoney(amount, currencyCode.value);
}

function formatChange(change: ValueChange | null): string {
  if (!change) return '—';
  const abs = `${change.absolute >= 0 ? '+' : ''}${money(change.absolute)}`;
  if (change.percent == null) return abs;
  const sign = change.percent >= 0 ? '+' : '';
  return `${abs} (${sign}${formatPercent(change.percent)}%)`;
}

function changeClass(change: ValueChange | null): string {
  if (!change || change.absolute === 0) return 'text-muted';
  return change.absolute > 0 ? 'text-success' : 'text-danger';
}

function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statsFor(account: PortfolioAccount): AccountValueStats {
  return (
    accountStatsById.value.get(account.id) ?? accountValueStats(account)
  );
}

async function loadAccounts() {
  if (!activeProfileId.value) {
    accounts.value = [];
    return;
  }
  loading.value = true;
  try {
    accounts.value = await window.fundlog.portfolio.listByProfile(
      activeProfileId.value,
    );
  } catch (e) {
    console.error(e);
    toast.error(
      errorMessageFromUnknown(e, 'Failed to load portfolio accounts.'),
    );
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await loadAccounts();
});

watch(
  () => domain.activeProfileId,
  async () => {
    historyAccount.value = null;
    editingAccount.value = null;
    editingSnapshot.value = null;
    await loadAccounts();
  },
);

function openAddAccountModal() {
  editingAccount.value = null;
  accountName.value = '';
  accountNote.value = '';
}

function openEditAccountModal(account: PortfolioAccount) {
  editingAccount.value = account;
  accountName.value = account.name;
  accountNote.value = account.note ?? '';
}

function openLogValueModal(accountId?: number) {
  logAccountId.value =
    accountId ?? accounts.value[0]?.id ?? null;
  logDate.value = todayIso();
  logValue.value = null;
}

function openHistoryModal(account: PortfolioAccount) {
  historyAccount.value = account;
  historyDateFrom.value = '';
  historyDateTo.value = '';
}

function openEditSnapshotModal(
  accountId: number,
  snapshot: PortfolioSnapshot,
) {
  editingSnapshot.value = { accountId, snapshot };
  editSnapDate.value = snapshot.date;
  editSnapValue.value = snapshot.value;
  hideBsModal('portfolioHistoryModal');
  showBsModal('editPortfolioSnapshotModal');
}

async function submitAccount() {
  if (!activeProfileId.value || !accountName.value.trim()) return;
  const isEdit = !!editingAccount.value;
  try {
    if (editingAccount.value) {
      await window.fundlog.portfolio.update({
        id: editingAccount.value.id,
        profileId: activeProfileId.value,
        name: accountName.value.trim(),
        note: accountNote.value.trim() || null,
      });
      toast.success('Account updated.');
    } else {
      await window.fundlog.portfolio.create({
        profileId: activeProfileId.value,
        name: accountName.value.trim(),
        note: accountNote.value.trim() || null,
      });
      toast.success('Account added.');
    }
    editingAccount.value = null;
    await loadAccounts();
    hideBsModal(isEdit ? 'editPortfolioAccountModal' : 'addPortfolioAccountModal');
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not save account.'));
  }
}

async function removeAccount(id: number) {
  if (!activeProfileId.value) return;
  if (!confirm('Delete this account and all its value history?')) return;
  try {
    await window.fundlog.portfolio.delete({
      id,
      profileId: activeProfileId.value,
    });
    toast.success('Account removed.');
    await loadAccounts();
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not delete account.'));
  }
}

async function submitLogValue() {
  if (!activeProfileId.value || logAccountId.value == null) return;
  if (logValue.value == null || !Number.isFinite(logValue.value)) {
    toast.error('Enter a valid value.');
    return;
  }
  const date = logDate.value.trim() || todayIso();
  try {
    await window.fundlog.portfolio.snapshotUpsert({
      accountId: logAccountId.value,
      profileId: activeProfileId.value,
      date,
      value: logValue.value,
    });
    toast.success('Value logged.');
    await loadAccounts();
    if (historyAccount.value?.id === logAccountId.value) {
      historyAccount.value =
        accounts.value.find((a) => a.id === logAccountId.value) ?? null;
    }
    hideBsModal('logPortfolioValueModal');
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not log value.'));
  }
}

async function submitEditSnapshot() {
  if (!activeProfileId.value || !editingSnapshot.value) return;
  if (editSnapValue.value == null || !Number.isFinite(editSnapValue.value)) {
    toast.error('Enter a valid value.');
    return;
  }
  try {
    await window.fundlog.portfolio.snapshotUpdate({
      id: editingSnapshot.value.snapshot.id,
      profileId: activeProfileId.value,
      date: editSnapDate.value.trim(),
      value: editSnapValue.value,
    });
    toast.success('Entry updated.');
    const accountId = editingSnapshot.value.accountId;
    editingSnapshot.value = null;
    await loadAccounts();
    historyAccount.value =
      accounts.value.find((a) => a.id === accountId) ?? null;
    hideBsModal('editPortfolioSnapshotModal');
    if (historyAccount.value) {
      showBsModal('portfolioHistoryModal');
    }
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not update entry.'));
  }
}

async function removeSnapshot(snapshotId: number, accountId: number) {
  if (!activeProfileId.value) return;
  if (!confirm('Delete this value entry?')) return;
  try {
    await window.fundlog.portfolio.snapshotDelete({
      id: snapshotId,
      profileId: activeProfileId.value,
    });
    toast.success('Entry removed.');
    await loadAccounts();
    historyAccount.value =
      accounts.value.find((a) => a.id === accountId) ?? null;
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Could not delete entry.'));
  }
}
</script>

<template>
  <div class="view portfolio-snapshot-view container-fluid">
    <h2 class="mb-2">Portfolio Snapshot</h2>
    <p class="view-subtitle mb-2 small">
      Track named accounts with one value per day. Charts and change stats update
      each time you log a new amount.
    </p>

    <p v-if="!activeProfileId" class="status-text">
      Create a profile in Settings to manage your portfolio.
    </p>

    <template v-else>
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#addPortfolioAccountModal"
          @click="openAddAccountModal"
        >
          Add account
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-bs-toggle="modal"
          data-bs-target="#logPortfolioValueModal"
          :disabled="!accounts.length"
          @click="openLogValueModal()"
        >
          Log value
        </button>
      </div>

      <div v-if="loading" class="portfolio-empty-hint mb-3">
        <LoadingView message="Loading portfolio…" />
      </div>

      <template v-else>
        <div
          v-if="accounts.length && totalStats.accountsWithValue"
          class="portfolio-total card border shadow-none mb-4"
        >
          <div class="card-body p-3">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div>
                <div class="portfolio-section-label mb-1">Total net worth</div>
                <div class="h4 mb-0">{{ money(totalStats.total) }}</div>
                <p class="small text-muted mb-0 mt-1">
                  <template v-if="totalStats.asOfDate">
                    As of {{ formatShortDate(totalStats.asOfDate) }} · last known
                    value per account
                  </template>
                  <template v-else>
                    Last known value per account
                  </template>
                </p>
              </div>
              <div v-if="totalStats.change" class="text-sm-end">
                <div class="portfolio-section-label mb-1">
                  vs {{ formatShortDate(totalStats.previousDate!) }}
                </div>
                <div
                  class="fw-semibold"
                  :class="changeClass(totalStats.change)"
                >
                  {{ formatChange(totalStats.change) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!accounts.length" class="portfolio-empty-hint mb-3">
          <p class="portfolio-empty-title">No accounts yet</p>
          <p class="portfolio-empty-muted mb-0">
            Add an account (brokerage, 401(k), savings, etc.), then use
            <strong>Log value</strong> to record today’s balance. Same-day
            entries update that day’s value.
          </p>
        </div>

        <div v-else class="row gy-4">
          <div
            v-for="account in accounts"
            :key="account.id"
            class="col-12"
          >
            <div class="card portfolio-account-card border shadow-none">
              <div
                class="card-header d-flex flex-column flex-sm-row justify-content-between align-items-sm-start gap-2 py-3 px-3 bg-transparent border-bottom border-secondary-subtle"
              >
                <div class="flex-grow-1 min-w-0">
                  <h3 class="portfolio-account-title h6 mb-1 text-break">
                    {{ account.name }}
                  </h3>
                  <p
                    v-if="account.note"
                    class="small text-muted mb-0"
                  >
                    {{ account.note }}
                  </p>
                </div>
                <div
                  class="btn-group btn-group-sm flex-shrink-0"
                  role="group"
                  aria-label="Account actions"
                >
                  <button
                    type="button"
                    class="btn btn-outline-primary"
                    data-bs-toggle="modal"
                    data-bs-target="#logPortfolioValueModal"
                    @click="openLogValueModal(account.id)"
                  >
                    Log value
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    data-bs-toggle="modal"
                    data-bs-target="#editPortfolioAccountModal"
                    @click="openEditAccountModal(account)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger"
                    @click="removeAccount(account.id)"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div class="card-body p-3">
                <template v-if="statsFor(account).current">
                  <div class="row g-3 mb-3">
                    <div class="col-sm-6 col-lg-3">
                      <div class="portfolio-section-label mb-1">Current</div>
                      <div class="fw-semibold">
                        {{ money(statsFor(account).current!.value) }}
                      </div>
                      <div class="small text-muted">
                        {{ formatShortDate(statsFor(account).current!.date) }}
                      </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                      <div class="portfolio-section-label mb-1">
                        Since previous
                      </div>
                      <div
                        class="fw-semibold"
                        :class="changeClass(statsFor(account).changeVsPrevious)"
                      >
                        {{ formatChange(statsFor(account).changeVsPrevious) }}
                      </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                      <div class="portfolio-section-label mb-1">
                        Since first
                      </div>
                      <div
                        class="fw-semibold"
                        :class="changeClass(statsFor(account).changeVsFirst)"
                      >
                        {{ formatChange(statsFor(account).changeVsFirst) }}
                      </div>
                    </div>
                    <div class="col-sm-6 col-lg-3">
                      <div class="portfolio-section-label mb-1">High / low</div>
                      <div class="fw-semibold small">
                        {{ money(statsFor(account).high!) }}
                        <span class="text-muted">/</span>
                        {{ money(statsFor(account).low!) }}
                      </div>
                    </div>
                  </div>

                  <PortfolioValueLineChart
                    v-if="account.snapshots.length"
                    :snapshots="account.snapshots"
                    :currency-code="currencyCode"
                    class="mb-3"
                  />

                  <button
                    type="button"
                    class="btn btn-sm btn-link px-0"
                    data-bs-toggle="modal"
                    data-bs-target="#portfolioHistoryModal"
                    @click="openHistoryModal(account)"
                  >
                    View history ({{ account.snapshots.length }})
                  </button>
                </template>
                <template v-else>
                  <p class="text-muted small mb-2 mb-sm-0">
                    No values logged yet.
                  </p>
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    data-bs-toggle="modal"
                    data-bs-target="#logPortfolioValueModal"
                    @click="openLogValueModal(account.id)"
                  >
                    Log first value
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>

  <!-- Add account -->
  <div
    id="addPortfolioAccountModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="addPortfolioAccountModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addPortfolioAccountModalLabel" class="modal-title">
            Add account
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label"
              >Name <span class="text-danger">*</span></label
            >
            <input
              v-model="accountName"
              type="text"
              class="form-control"
              placeholder="Brokerage, 401(k), Cash…"
            />
          </div>
          <div class="col-12">
            <label class="form-label">Note</label>
            <textarea
              v-model="accountNote"
              class="form-control"
              rows="2"
              placeholder="Optional"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!accountName.trim()"
            @click="submitAccount"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit account -->
  <div
    id="editPortfolioAccountModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="editPortfolioAccountModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="editPortfolioAccountModalLabel" class="modal-title">
            Edit account
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label"
              >Name <span class="text-danger">*</span></label
            >
            <input v-model="accountName" type="text" class="form-control" />
          </div>
          <div class="col-12">
            <label class="form-label">Note</label>
            <textarea
              v-model="accountNote"
              class="form-control"
              rows="2"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!accountName.trim()"
            @click="submitAccount"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Log value -->
  <div
    id="logPortfolioValueModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="logPortfolioValueModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="logPortfolioValueModalLabel" class="modal-title">
            Log value
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label"
              >Account <span class="text-danger">*</span></label
            >
            <select v-model="logAccountId" class="form-select">
              <option
                v-for="a in accounts"
                :key="a.id"
                :value="a.id"
              >
                {{ a.name }}
              </option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label"
              >Date <span class="text-danger">*</span></label
            >
            <input v-model="logDate" type="date" class="form-control" />
            <p class="form-text mb-0">
              One value per day — logging again replaces that day’s amount.
            </p>
          </div>
          <div class="col-md-6">
            <label class="form-label"
              >Value <span class="text-danger">*</span></label
            >
            <input
              v-model.number="logValue"
              type="number"
              step="0.01"
              class="form-control"
              placeholder="0.00"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="logAccountId == null || logValue == null"
            @click="submitLogValue"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- History -->
  <div
    id="portfolioHistoryModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="portfolioHistoryModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="portfolioHistoryModalLabel" class="modal-title">
            History
            <span v-if="historyAccount" class="fw-normal text-muted"
              >· {{ historyAccount.name }}</span
            >
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body">
          <div
            v-if="!historyAccount?.snapshots.length"
            class="text-muted small"
          >
            No entries yet.
          </div>
          <template v-else>
            <div class="row g-2 mb-3">
              <div class="col-sm-6">
                <label class="form-label small mb-1">From</label>
                <input
                  v-model="historyDateFrom"
                  type="date"
                  class="form-control form-control-sm"
                />
              </div>
              <div class="col-sm-6">
                <label class="form-label small mb-1">To</label>
                <input
                  v-model="historyDateTo"
                  type="date"
                  class="form-control form-control-sm"
                />
              </div>
            </div>
            <p v-if="!filteredHistorySnapshots.length" class="text-muted small">
              No entries in this date range.
            </p>
            <div v-else class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Value</th>
                    <th scope="col" class="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="snap in filteredHistorySnapshots"
                    :key="snap.id"
                  >
                    <td>{{ formatShortDate(snap.date) }}</td>
                    <td>{{ money(snap.value) }}</td>
                    <td class="text-end">
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary me-1"
                        @click="openEditSnapshotModal(historyAccount!.id, snap)"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-danger"
                        @click="removeSnapshot(snap.id, historyAccount!.id)"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit snapshot -->
  <div
    id="editPortfolioSnapshotModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="editPortfolioSnapshotModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="editPortfolioSnapshotModalLabel" class="modal-title">
            Edit entry
          </h5>
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close"
          />
        </div>
        <div class="modal-body row g-3">
          <div class="col-md-6">
            <label class="form-label"
              >Date <span class="text-danger">*</span></label
            >
            <input v-model="editSnapDate" type="date" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label"
              >Value <span class="text-danger">*</span></label
            >
            <input
              v-model.number="editSnapValue"
              type="number"
              step="0.01"
              class="form-control"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-bs-dismiss="modal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="editSnapValue == null"
            @click="submitEditSnapshot"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
