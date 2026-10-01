<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useToast } from 'vue-toastification';
import CollapsibleSection from '../components/CollapsibleSection.vue';
import LoadingView from '../components/LoadingView.vue';
import RetirementProjectionChart from '../components/RetirementProjectionChart.vue';
import { useDomainStore } from '../stores/domain';
import { confirmAction } from '../shared/confirmAction';
import { errorMessageFromUnknown } from '../shared/errors';
import { formatMoney, formatPercent } from '../shared/formatMoney';
import {
  DEFAULT_RETIREMENT_INPUTS,
  computeRetirement,
  type FireTarget,
  type FireTargetKey,
} from '../shared/retirementCalc';
import type { RetirementInputs } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

type FieldKey = keyof RetirementInputs;
type Draft = Record<FieldKey, string>;

function toDraft(v: RetirementInputs): Draft {
  return {
    currentAge: String(v.currentAge),
    retirementAge: String(v.retirementAge),
    currentInvested: String(v.currentInvested),
    annualContribution: String(v.annualContribution),
    annualSpending: String(v.annualSpending),
    leanAnnualSpending: String(v.leanAnnualSpending),
    fatAnnualSpending: String(v.fatAnnualSpending),
    baristaAnnualIncome: String(v.baristaAnnualIncome),
    expectedReturnPct: String(v.expectedReturnPct),
    inflationPct: String(v.inflationPct),
    withdrawalRatePct: String(v.withdrawalRatePct),
  };
}

const FIELD_LABELS: Record<FieldKey, string> = {
  currentAge: 'Current age',
  retirementAge: 'Target retirement age',
  currentInvested: 'Invested today',
  annualContribution: 'Yearly contributions',
  annualSpending: 'Yearly spending in retirement',
  leanAnnualSpending: 'Lean yearly spending (Lean FIRE tab)',
  fatAnnualSpending: 'Fat yearly spending (Fat FIRE tab)',
  baristaAnnualIncome: 'Part-time yearly income (Barista FIRE tab)',
  expectedReturnPct: 'Expected yearly return (Assumptions)',
  inflationPct: 'Inflation (Assumptions)',
  withdrawalRatePct: 'Safe withdrawal rate (Assumptions)',
};

const MONEY_KEYS: FieldKey[] = [
  'currentInvested',
  'annualContribution',
  'annualSpending',
  'leanAnnualSpending',
  'fatAnnualSpending',
  'baristaAnnualIncome',
];

/** Accepts "20,000", "$20000", "20k", "1.5m", "7%"; null when it can't be read. */
function parseNumberInput(raw: string, isMoney: boolean): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/[\s,$€£¥%]/g, '');
  const match = /^(\d+(?:\.\d*)?|\.\d+)([km]?)$/.exec(cleaned);
  if (!match) return null;
  const [, digits, suffix] = match;
  if (suffix && !isMoney) return null;
  // Three or more decimals in an amount is most likely a "20.000" thousands separator.
  if (isMoney && /\.\d{3,}$/.test(digits)) return null;
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1;
  const n = Number(digits) * multiplier;
  return Number.isFinite(n) ? n : null;
}

type FieldError = { key: FieldKey; message: string };

/** Unreadable fields fall back to their default and are reported in `errors`. */
function parseDraft(d: Draft): { values: RetirementInputs; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const read = (k: FieldKey): number => {
    const isMoney = MONEY_KEYS.includes(k);
    const n = parseNumberInput(d[k], isMoney);
    if (n == null) {
      errors.push({
        key: k,
        message: isMoney ? 'Use a plain amount like 20000 or 20k.' : 'Use a plain number like 7.',
      });
      return DEFAULT_RETIREMENT_INPUTS[k];
    }
    return n;
  };
  const values: RetirementInputs = {
    currentAge: read('currentAge'),
    retirementAge: read('retirementAge'),
    currentInvested: read('currentInvested'),
    annualContribution: read('annualContribution'),
    annualSpending: read('annualSpending'),
    leanAnnualSpending: read('leanAnnualSpending'),
    fatAnnualSpending: read('fatAnnualSpending'),
    baristaAnnualIncome: read('baristaAnnualIncome'),
    expectedReturnPct: read('expectedReturnPct'),
    inflationPct: read('inflationPct'),
    withdrawalRatePct: read('withdrawalRatePct'),
  };
  const hasError = (...keys: FieldKey[]) => errors.some((e) => keys.includes(e.key));
  if (!hasError('currentAge', 'retirementAge') && values.retirementAge < values.currentAge) {
    errors.push({ key: 'retirementAge', message: 'Can’t be below your current age.' });
  }
  if (!hasError('withdrawalRatePct') && values.withdrawalRatePct <= 0) {
    errors.push({ key: 'withdrawalRatePct', message: 'Must be above 0%.' });
  }
  if (
    !hasError('leanAnnualSpending', 'annualSpending') &&
    values.leanAnnualSpending > values.annualSpending
  ) {
    errors.push({
      key: 'leanAnnualSpending',
      message: 'Should be at or below your yearly spending in retirement.',
    });
  }
  if (
    !hasError('fatAnnualSpending', 'annualSpending') &&
    values.fatAnnualSpending < values.annualSpending
  ) {
    errors.push({
      key: 'fatAnnualSpending',
      message: 'Should be at or above your yearly spending in retirement.',
    });
  }
  return { values, errors };
}

/** Text being edited; results only follow `appliedInputs`, updated by Calculate. */
const draft = ref<Draft>(toDraft(DEFAULT_RETIREMENT_INPUTS));
const appliedInputs = ref<RetirementInputs>({ ...DEFAULT_RETIREMENT_INPUTS });
const loading = ref(false);
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');

const activeProfileId = computed(() => domain.activeProfileId);
const currencyCode = computed(() => domain.activeProfile?.currencyCode?.trim() || 'USD');

const draftErrors = computed(() => parseDraft(draft.value).errors);

function fieldError(key: FieldKey): string | undefined {
  return draftErrors.value.find((e) => e.key === key)?.message;
}

type Field = { key: FieldKey; label: string; unit: 'money' | 'pct' | 'age'; hint?: string };

const coreGroups: { title: string; fields: Field[] }[] = [
  {
    title: 'Timeline',
    fields: [
      { key: 'currentAge', label: 'Current age', unit: 'age' },
      { key: 'retirementAge', label: 'Retire at', unit: 'age' },
    ],
  },
  {
    title: 'Savings',
    fields: [
      {
        key: 'currentInvested',
        label: 'Invested today',
        unit: 'money',
        hint: 'Retirement accounts and brokerage, not your emergency fund',
      },
      {
        key: 'annualContribution',
        label: 'Yearly contributions',
        unit: 'money',
        hint: 'What you add each year, including any employer match',
      },
    ],
  },
  {
    title: 'In retirement',
    fields: [
      {
        key: 'annualSpending',
        label: 'Yearly spending',
        unit: 'money',
        hint: 'What you expect to spend each year, in today’s dollars',
      },
    ],
  },
];

const assumptionFields: Field[] = [
  { key: 'expectedReturnPct', label: 'Expected yearly return', unit: 'pct', hint: 'Before inflation' },
  { key: 'inflationPct', label: 'Inflation', unit: 'pct' },
  { key: 'withdrawalRatePct', label: 'Safe withdrawal rate', unit: 'pct', hint: '4% is the common rule of thumb' },
];

type MethodKey = FireTargetKey | 'coast';

const METHODS: { key: MethodKey; label: string; description: string; field?: Field }[] = [
  {
    key: 'regular',
    label: 'FIRE',
    description:
      'Classic FIRE: invest enough that withdrawing your safe withdrawal rate each year covers your normal spending for good, so work becomes optional.',
  },
  {
    key: 'coast',
    label: 'Coast FIRE',
    description:
      'Front-load your saving, then let compound growth finish the job. Once you hit your Coast number you can stop contributing for retirement and only earn enough to cover today’s bills. Your investments keep growing on their own until they reach your FIRE number by your target retirement age.',
  },
  {
    key: 'lean',
    label: 'Lean FIRE',
    description:
      'Financial independence on a bare-bones budget. You can stop working sooner, but there’s little room for extras or surprises.',
    field: { key: 'leanAnnualSpending', label: 'Lean yearly spending', unit: 'money' },
  },
  {
    key: 'fat',
    label: 'Fat FIRE',
    description:
      'Financial independence with a generous lifestyle, like more travel, a bigger home, or extra cushion. It takes longer to reach.',
    field: { key: 'fatAnnualSpending', label: 'Fat yearly spending', unit: 'money' },
  },
  {
    key: 'barista',
    label: 'Barista FIRE',
    description:
      'Leave full-time work and take a part-time or lower-stress job. That income covers part of your spending, so your investments only need to cover the rest.',
    field: { key: 'baristaAnnualIncome', label: 'Part-time yearly income', unit: 'money' },
  },
];

const selectedMethodKey = ref<MethodKey>('regular');
const selectedMethod = computed(
  () => METHODS.find((m) => m.key === selectedMethodKey.value) ?? METHODS[0],
);

const result = computed(() => computeRetirement(appliedInputs.value));

const isDirty = computed(
  () => JSON.stringify(draft.value) !== JSON.stringify(toDraft(appliedInputs.value)),
);
const regularTarget = computed(() => result.value.targets.find((t) => t.key === 'regular'));
const selectedTarget = computed(() =>
  result.value.targets.find((t) => t.key === selectedMethodKey.value),
);

function money(amount: number): string {
  return Number.isFinite(amount) ? formatMoney(amount, currencyCode.value) : '—';
}

function formatYears(months: number): string {
  const years = months / 12;
  return `${years.toFixed(1)} ${years === 1 ? 'year' : 'years'}`;
}

function targetStatus(t: FireTarget): string {
  if (!Number.isFinite(t.number)) return 'set a withdrawal rate above 0%.';
  if (t.reached) return 'you’ve already reached this.';
  if (t.ageReached == null || t.monthsToReach == null) {
    return 'not reachable within 80 years at your current numbers. Add yearly contributions or invested savings to see an age.';
  }
  const when = `you reach this at age ${Math.round(t.ageReached)} (in ${formatYears(t.monthsToReach)})`;
  if (t.afterRetirement) {
    return `${when}, which is after your target retirement age of ${appliedInputs.value.retirementAge}. You’d need to keep contributing until then.`;
  }
  return `${when}.`;
}

/** Same wording for every method so ages read consistently. */
function ageLabel(age: number | null): string {
  return age == null ? 'Not reachable' : `Age ${Math.round(age)}`;
}

/** Part-time income alone covers retirement spending, so the Barista target is $0. */
const baristaCovered = computed(
  () => result.value.targets.find((t) => t.key === 'barista')?.coveredSpending === 0,
);

/** Projected age shown on each method tab. */
function methodBadge(key: MethodKey): string {
  if (key === 'coast') {
    const c = result.value.coast;
    return c.reached ? 'Reached' : ageLabel(c.coastAge);
  }
  if (key === 'barista' && baristaCovered.value) return 'Covered';
  const t = result.value.targets.find((x) => x.key === key);
  if (!t) return '';
  if (!Number.isFinite(t.number)) return '—';
  return t.reached ? 'Reached' : ageLabel(t.ageReached);
}

function methodAfterRetirement(key: MethodKey): boolean {
  if (key === 'coast') return result.value.coast.afterRetirement;
  return result.value.targets.find((x) => x.key === key)?.afterRetirement ?? false;
}

/** Yearly contribution needed to reach the target by retirement age. */
function neededPerYear(t: FireTarget): string {
  if (t.reached || t.requiredAnnualContribution == null) return money(0);
  return money(t.requiredAnnualContribution);
}

function contributionOnTrack(t: FireTarget): boolean {
  return (
    t.reached ||
    t.requiredAnnualContribution == null ||
    appliedInputs.value.annualContribution >= t.requiredAnnualContribution
  );
}

const coastStillNeeded = computed(() =>
  Math.max(0, result.value.coast.numberToday - appliedInputs.value.currentInvested),
);

function coastStillNeededClass(): string {
  if (coastStillNeeded.value <= 0) return 'text-success';
  const c = result.value.coast;
  if (c.coastAge == null) return 'text-danger';
  return c.afterRetirement ? 'text-warning-emphasis' : '';
}

function methodReached(key: MethodKey): boolean {
  if (key === 'coast') return result.value.coast.reached;
  return result.value.targets.find((x) => x.key === key)?.reached ?? false;
}

function methodBadgeClass(key: MethodKey): string {
  if (methodReached(key)) return 'text-bg-success';
  if (methodAfterRetirement(key)) return 'text-bg-warning';
  return 'text-bg-light';
}

function progressPct(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 100;
  return Math.min(100, (Math.max(0, appliedInputs.value.currentInvested || 0) / target) * 100);
}

const resultsEl = ref<HTMLElement | null>(null);
/** Below Bootstrap's `lg` breakpoint the results sit under the inputs. */
const stackedLayout = window.matchMedia('(max-width: 991.98px)');

/** Only the latest load may write results, so a slower earlier load can't overwrite it. */
let loadToken = 0;

async function loadInputs() {
  const profileId = activeProfileId.value;
  if (!profileId) return;
  const token = ++loadToken;
  loading.value = true;
  try {
    const saved = await window.fundlog.retirement.get(profileId);
    if (token !== loadToken) return;
    const { values } = parseDraft(toDraft({ ...DEFAULT_RETIREMENT_INPUTS, ...saved }));
    appliedInputs.value = values;
    draft.value = toDraft(values);
    saveState.value = 'idle';
  } catch (e) {
    console.error(e);
    toast.error(errorMessageFromUnknown(e, 'Failed to load retirement inputs.'));
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

async function saveInputs(profileId: number, values: RetirementInputs) {
  saveState.value = 'saving';
  try {
    await window.fundlog.retirement.save({ profileId, inputs: { ...values } });
    saveState.value = 'saved';
  } catch (e) {
    console.error(e);
    saveState.value = 'idle';
    toast.error(errorMessageFromUnknown(e, 'Could not save retirement inputs.'));
  }
}

async function calculate() {
  const { values, errors } = parseDraft(draft.value);
  if (errors.length) {
    toast.error('Fix the highlighted fields before calculating.');
    return;
  }
  appliedInputs.value = values;
  draft.value = toDraft(values);
  if (stackedLayout.matches) {
    resultsEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (activeProfileId.value) await saveInputs(activeProfileId.value, values);
}

function discardChanges() {
  draft.value = toDraft(appliedInputs.value);
}

async function resetInputs() {
  const ok = await confirmAction('Reset all inputs to their defaults?', {
    title: 'Reset calculator',
    confirmLabel: 'Reset',
  });
  if (!ok) return;
  draft.value = toDraft(DEFAULT_RETIREMENT_INPUTS);
  await calculate();
}

/** Offers to keep uncalculated edits for the profile being left before loading the new one. */
async function keepChangesForProfile(profileId: number) {
  if (!isDirty.value) return;
  const { values, errors } = parseDraft(draft.value);
  if (errors.length) {
    toast.warning('Your uncalculated retirement changes had invalid values and were discarded.');
    return;
  }
  const ok = await confirmAction(
    'You changed retirement calculator values without calculating. Save them to the profile you’re leaving?',
    { title: 'Uncalculated changes', confirmLabel: 'Save changes' },
  );
  if (ok) await saveInputs(profileId, values);
}

onMounted(async () => {
  await domain.loadProfiles();
});

watch(
  () => domain.activeProfileId,
  async (_profileId, previousProfileId) => {
    if (previousProfileId) await keepChangesForProfile(previousProfileId);
    await loadInputs();
  },
  { immediate: true },
);
</script>

<template>
  <div class="view retirement-view container-fluid">
    <h2 class="mb-2">Retirement Calculator</h2>
    <p class="view-subtitle mb-3 small">
      See when you could reach financial independence. All amounts are in today’s dollars.
    </p>

    <p v-if="!activeProfileId" class="status-text">
      Create a profile in Settings to use the retirement calculator.
    </p>

    <LoadingView v-else-if="loading" message="Loading calculator…" />

    <div v-else class="row g-4">
      <div class="col-12 col-lg-4">
        <div class="card retirement-card border shadow-none mb-3">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-baseline gap-2 mb-1">
              <h3 class="h6 mb-0">Your numbers</h3>
              <span class="small text-muted">
                {{ saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : '' }}
              </span>
            </div>
            <p class="small text-muted mb-0">Change any value, then press Calculate.</p>

            <section
              v-for="group in coreGroups"
              :key="group.title"
              class="border-top pt-3 mt-3"
            >
              <div class="retirement-section-label mb-2">{{ group.title }}</div>
              <div class="row g-3">
                <div
                  v-for="f in group.fields"
                  :key="f.key"
                  :class="f.unit === 'age' ? 'col-6' : 'col-12 col-sm-6 col-lg-12'"
                >
                  <label class="form-label small fw-semibold mb-1" :for="`retirement-${f.key}`">
                    {{ f.label }}
                  </label>
                  <div class="input-group">
                    <span v-if="f.unit === 'money'" class="input-group-text">{{ currencyCode }}</span>
                    <input
                      :id="`retirement-${f.key}`"
                      v-model="draft[f.key]"
                      type="text"
                      inputmode="decimal"
                      class="form-control text-end"
                      :class="{ 'is-invalid': fieldError(f.key) }"
                      :aria-describedby="f.hint ? `retirement-${f.key}-hint` : undefined"
                      @keydown.enter="calculate"
                    />
                    <span v-if="f.unit === 'age'" class="input-group-text">yrs</span>
                  </div>
                  <div v-if="fieldError(f.key)" class="invalid-feedback d-block">{{ fieldError(f.key) }}</div>
                  <div v-else-if="f.hint" :id="`retirement-${f.key}-hint`" class="form-text">
                    {{ f.hint }}
                  </div>
                </div>
              </div>
            </section>

            <div class="border-top pt-3 mt-3">
              <p v-if="draftErrors.length" class="small text-danger mb-2">
                Fix before calculating: {{ draftErrors.map((e) => FIELD_LABELS[e.key]).join(', ') }}.
              </p>
              <button
                type="button"
                class="btn btn-primary w-100"
                :disabled="!isDirty"
                @click="calculate"
              >
                {{ isDirty ? 'Calculate' : 'Results are up to date' }}
              </button>
            </div>
          </div>
        </div>

        <CollapsibleSection
          title="Assumptions"
          :meta="`${formatPercent(appliedInputs.expectedReturnPct)}% return · ${formatPercent(appliedInputs.inflationPct)}% inflation · ${formatPercent(appliedInputs.withdrawalRatePct)}% withdrawal`"
          :default-expanded="false"
          storage-key="retirement-assumptions"
          heading-class="h6"
        >
          <div class="row g-3">
            <div v-for="f in assumptionFields" :key="f.key" class="col-12 col-sm-4 col-lg-12">
              <label class="form-label small fw-semibold mb-1" :for="`retirement-${f.key}`">
                {{ f.label }}
              </label>
              <div class="input-group">
                <input
                  :id="`retirement-${f.key}`"
                  v-model="draft[f.key]"
                  type="text"
                  inputmode="decimal"
                  class="form-control text-end"
                  :class="{ 'is-invalid': fieldError(f.key) }"
                  @keydown.enter="calculate"
                />
                <span class="input-group-text">%</span>
              </div>
              <div v-if="fieldError(f.key)" class="invalid-feedback d-block">{{ fieldError(f.key) }}</div>
              <div v-else-if="f.hint" class="form-text">{{ f.hint }}</div>
            </div>
          </div>
          <p class="form-text mb-0 mt-2">
            All amounts are in today’s dollars, so your contributions and spending are assumed to
            rise with inflation each year.
          </p>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-3" @click="resetInputs">
            Reset all to defaults
          </button>
        </CollapsibleSection>
      </div>

      <div ref="resultsEl" class="col-12 col-lg-8">
        <div
          v-if="isDirty"
          class="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 mb-3"
          role="status"
        >
          <span class="small">You’ve changed some values. Results below are from your last calculation.</span>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" @click="discardChanges">
              Discard changes
            </button>
            <button type="button" class="btn btn-sm btn-primary" @click="calculate">
              Calculate
            </button>
          </div>
        </div>

        <div class="card retirement-card border shadow-none mb-3">
          <div class="card-body p-3">
            <div class="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-3 text-center text-sm-start">
              <div class="col">
                <div class="retirement-section-label mb-1">FIRE target</div>
                <div class="h5 mb-0">{{ money(regularTarget?.number ?? Infinity) }}</div>
              </div>
              <div class="col">
                <div class="retirement-section-label mb-1">
                  Projected at {{ appliedInputs.retirementAge }}
                </div>
                <div
                  class="h5 mb-0"
                  :class="(regularTarget?.surplusAtRetirement ?? -1) >= 0 ? 'text-success' : ''"
                >
                  {{ money(result.balanceAtRetirement) }}
                </div>
              </div>
              <div class="col">
                <div class="retirement-section-label mb-1">Needed per year</div>
                <div
                  v-if="regularTarget"
                  class="h5 mb-0"
                  :class="contributionOnTrack(regularTarget) ? 'text-success' : 'text-danger'"
                >
                  {{ neededPerYear(regularTarget) }}
                </div>
                <div class="small text-muted">
                  you put in {{ money(appliedInputs.annualContribution) }}
                </div>
              </div>
              <div class="col">
                <div class="retirement-section-label mb-1">Financially independent</div>
                <div class="h5 mb-0">{{ methodBadge('regular') }}</div>
                <div v-if="methodAfterRetirement('regular')" class="small text-warning-emphasis">
                  after your target age of {{ appliedInputs.retirementAge }}
                </div>
              </div>
              <div class="col">
                <div class="retirement-section-label mb-1">Coast FIRE</div>
                <div class="h5 mb-0">{{ methodBadge('coast') }}</div>
                <div v-if="methodAfterRetirement('coast')" class="small text-warning-emphasis">
                  after your target age of {{ appliedInputs.retirementAge }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ul class="nav nav-pills flex-wrap gap-2 mb-3" role="tablist" aria-label="FIRE methods">
          <li v-for="m in METHODS" :key="m.key" class="nav-item" role="presentation">
            <button
              type="button"
              class="nav-link py-1 px-3"
              :class="{ active: selectedMethodKey === m.key }"
              role="tab"
              :aria-selected="selectedMethodKey === m.key"
              @click="selectedMethodKey = m.key"
            >
              {{ m.label }}
              <span
                class="badge rounded-pill ms-1"
                :class="methodBadgeClass(m.key)"
              >
                {{ methodBadge(m.key) }}
              </span>
            </button>
          </li>
        </ul>

        <div class="card retirement-card border shadow-none mb-3" role="tabpanel">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <h3 class="h6 mb-0">{{ selectedMethod.label }}</h3>
              <span v-if="methodReached(selectedMethod.key)" class="badge text-bg-success">
                {{ methodBadge(selectedMethod.key) }}
              </span>
            </div>
            <p class="small text-body-secondary mb-3 mt-1">{{ selectedMethod.description }}</p>

            <div v-if="selectedMethod.field" class="row mb-3">
              <div class="col-12 col-md-6">
                <label class="form-label small mb-1" :for="`retirement-${selectedMethod.field.key}`">
                  {{ selectedMethod.field.label }}
                </label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text">{{ currencyCode }}</span>
                  <input
                    :id="`retirement-${selectedMethod.field.key}`"
                    v-model="draft[selectedMethod.field.key]"
                    type="text"
                    inputmode="decimal"
                    class="form-control"
                    :class="{ 'is-invalid': fieldError(selectedMethod.field.key) }"
                    @keydown.enter="calculate"
                  />
                </div>
                <div v-if="fieldError(selectedMethod.field.key)" class="invalid-feedback d-block">
                  {{ fieldError(selectedMethod.field.key) }}
                </div>
              </div>
            </div>

            <template v-if="selectedMethod.key === 'coast'">
              <div class="row g-3 mb-3">
                <div class="col-12 col-sm-4">
                  <div class="retirement-section-label mb-1">Needed invested today</div>
                  <div class="h5 mb-0">{{ money(result.coast.numberToday) }}</div>
                </div>
                <div class="col-6 col-sm-4">
                  <div class="retirement-section-label mb-1">You have now</div>
                  <div class="h5 mb-0">{{ money(appliedInputs.currentInvested) }}</div>
                </div>
                <div class="col-6 col-sm-4">
                  <div class="retirement-section-label mb-1">Still needed</div>
                  <div class="h5 mb-0" :class="coastStillNeededClass()">
                    {{ money(coastStillNeeded) }}
                  </div>
                </div>
              </div>
              <div class="progress mb-2" style="height: 6px">
                <div
                  class="progress-bar"
                  :class="result.coast.reached ? 'bg-success' : 'bg-primary'"
                  role="progressbar"
                  :style="{ width: progressPct(result.coast.numberToday) + '%' }"
                  :aria-valuenow="Math.round(progressPct(result.coast.numberToday))"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
              <p class="small mb-1" :class="result.coast.reached ? 'text-success' : ''">
                <strong>Projected:</strong>
                <template v-if="result.coast.reached">
                  you can stop contributing now and still retire on time.
                </template>
                <template v-else-if="result.coast.coastAge != null && result.coast.monthsToCoast != null">
                  you reach Coast FIRE at age
                  <strong>{{ Math.round(result.coast.coastAge) }}</strong>
                  (in {{ formatYears(result.coast.monthsToCoast) }})<template
                    v-if="result.coast.afterRetirement"
                  >, which is after your target retirement age of {{ appliedInputs.retirementAge }}.
                    By then Coast FIRE and full FIRE are the same amount, so you’d need to keep
                    contributing until that age, or contribute more now to coast sooner.</template
                  ><template v-else>.</template>
                </template>
                <template v-else>
                  at your current numbers you won’t reach Coast FIRE within 80 years. Add yearly
                  contributions or invested savings to see an age.
                </template>
              </p>
              <p class="small text-muted mb-0">
                Stop contributing today and you’d have about
                {{ money(result.coast.balanceAtRetirementIfStopped) }} at {{ appliedInputs.retirementAge }}.
              </p>
            </template>

            <p v-else-if="selectedMethod.key === 'barista' && baristaCovered" class="small text-success mb-0">
              Your part-time income covers all of your yearly spending in retirement, so Barista FIRE
              doesn’t need any investments. Double-check that the part-time income is realistic.
            </p>

            <template v-else-if="selectedTarget">
              <div class="row g-3 mb-3">
                <div class="col-6 col-md-3">
                  <div class="retirement-section-label mb-1">Target</div>
                  <div class="h5 mb-0">{{ money(selectedTarget.number) }}</div>
                  <div class="small text-muted">
                    covers {{ money(selectedTarget.coveredSpending) }}/yr
                    <template v-if="selectedTarget.key === 'barista'">after part-time income</template>
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="retirement-section-label mb-1">
                    Projected at {{ appliedInputs.retirementAge }}
                  </div>
                  <div class="h5 mb-0">{{ money(result.balanceAtRetirement) }}</div>
                  <div class="small text-muted">
                    with {{ money(appliedInputs.annualContribution) }}/yr contributions
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="retirement-section-label mb-1">Needed per year</div>
                  <div
                    class="h5 mb-0"
                    :class="contributionOnTrack(selectedTarget) ? 'text-success' : 'text-danger'"
                  >
                    {{ neededPerYear(selectedTarget) }}
                  </div>
                  <div class="small text-muted">
                    to reach it by age {{ appliedInputs.retirementAge }}
                  </div>
                </div>
                <div class="col-6 col-md-3">
                  <div class="retirement-section-label mb-1">
                    {{ selectedTarget.surplusAtRetirement >= 0 ? 'Ahead by' : 'Short by' }}
                  </div>
                  <div
                    class="h5 mb-0"
                    :class="selectedTarget.surplusAtRetirement >= 0 ? 'text-success' : 'text-danger'"
                  >
                    {{ money(Math.abs(selectedTarget.surplusAtRetirement)) }}
                  </div>
                  <div class="small text-muted">at age {{ appliedInputs.retirementAge }}</div>
                </div>
              </div>
              <div class="progress mb-2" style="height: 6px">
                <div
                  class="progress-bar"
                  :class="selectedTarget.reached ? 'bg-success' : 'bg-primary'"
                  role="progressbar"
                  :style="{ width: progressPct(selectedTarget.number) + '%' }"
                  :aria-valuenow="Math.round(progressPct(selectedTarget.number))"
                  aria-valuemin="0"
                  aria-valuemax="100"
                />
              </div>
              <p class="small mb-1" :class="selectedTarget.reached ? 'text-success' : ''">
                <strong>Projected:</strong> {{ targetStatus(selectedTarget) }}
              </p>
              <p
                v-if="selectedTarget.requiredAnnualContribution != null"
                class="small text-muted mb-0"
              >
                <template v-if="!Number.isFinite(selectedTarget.requiredAnnualContribution)">
                  Set a target retirement age above your current age to see the contribution needed.
                </template>
                <template v-else-if="selectedTarget.surplusAtRetirement >= 0">
                  You’re on track. You could contribute as little as
                  {{ money(selectedTarget.requiredAnnualContribution) }}/yr and still hit this by age
                  {{ appliedInputs.retirementAge }}.
                </template>
                <template v-else>
                  To hit this by age {{ appliedInputs.retirementAge }}, contribute about
                  <strong>{{ money(selectedTarget.requiredAnnualContribution) }}/yr</strong>
                  ({{ money(selectedTarget.requiredAnnualContribution - appliedInputs.annualContribution) }}
                  more than now).
                </template>
              </p>
            </template>
          </div>
        </div>

        <CollapsibleSection
          title="Projection"
          :meta="`${money(result.balanceAtRetirement)} at ${appliedInputs.retirementAge} · ${formatPercent(result.realReturnPct)}% real return`"
          storage-key="retirement-projection"
          heading-class="h6"
        >
          <RetirementProjectionChart
            :projection="result.projection"
            :targets="result.targets"
            :currency-code="currencyCode"
          />
          <p class="small text-muted mb-0 mt-2">
            Contributions stop at your target retirement age, then your yearly spending is withdrawn
            each year. This is an estimate, not financial advice.
          </p>
        </CollapsibleSection>
      </div>
    </div>
  </div>
</template>
