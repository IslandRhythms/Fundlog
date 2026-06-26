<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BudgetHeadroomResult, SpendingTierStatus } from '../shared/budgetHeadroom';
import type { ImpactTxn } from '../shared/categoryImpact';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { FUND_COLORS, ringColorForRuleKey } from '../shared/fundColors';

export type TierLineItem = {
  id: number;
  label: string;
  planned: number;
  color: string;
};

export type TierSpend = {
  purchases: number;
  unexpected: number;
};

type TierKey = 'wants' | 'needs' | 'savings';

const props = withDefaults(
  defineProps<{
    headroom: BudgetHeadroomResult;
    currencyCode: string;
    monthLabel: string;
    variant?: 'snapshot' | 'planning';
    embedded?: boolean;
    tierLineItems?: Partial<Record<TierKey, TierLineItem[]>>;
    tierSpend?: Partial<Record<TierKey, TierSpend>>;
    tierItems?: Partial<Record<TierKey, ImpactTxn[]>>;
  }>(),
  {
    variant: 'planning',
    embedded: false,
    tierLineItems: undefined,
    tierSpend: undefined,
    tierItems: undefined,
  },
);

const expandedTiers = ref<Record<string, boolean>>({});

function lineItemsFor(key: string): TierLineItem[] {
  return props.tierLineItems?.[key as TierKey] ?? [];
}

function spendFor(key: string): TierSpend | null {
  const s = props.tierSpend?.[key as TierKey];
  if (!s || (s.purchases <= 0 && s.unexpected <= 0)) return null;
  return s;
}

function itemsFor(key: string): ImpactTxn[] {
  return props.tierItems?.[key as TierKey] ?? [];
}

/** Total purchases + unexpected drawn from the leftover by this tier. */
function spentTotal(key: string): number {
  const s = props.tierSpend?.[key as TierKey];
  if (!s) return 0;
  return s.purchases + s.unexpected;
}

function hasDrilldown(key: string): boolean {
  return lineItemsFor(key).length > 0 || spendFor(key) !== null;
}

function toggleTier(key: string) {
  expandedTiers.value[key] = !expandedTiers.value[key];
}

function txDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMoney(amount: number) {
  return formatMoneyExact(amount, props.currencyCode);
}

type RingSegment = {
  key: string;
  label: string;
  color: string;
  pct: number;
};

const TRACK_COLOR = 'color-mix(in srgb, var(--border) 55%, var(--card-bg))';

/**
 * Ring gradient: each bucket's arc is split so purchases and unexpected show in their
 * own colour while sitting inside the bucket's overall slice (e.g. a red purchase wedge
 * inside the blue Needs arc).
 */
const ringSegments = computed((): RingSegment[] => {
  const income = props.headroom.income;
  if (income <= 0) return [];

  const segments: RingSegment[] = [];

  for (const bucket of props.headroom.buckets) {
    if (bucket.committed <= 0) continue;
    const bucketColor = ringColorForRuleKey(bucket.ruleKey, bucket.color);
    const base = bucket.planned + bucket.goalSavings;
    if (base > 0) {
      segments.push({
        key: `${bucket.ruleKey}-base`,
        label: bucket.label,
        color: bucketColor,
        pct: (base / income) * 100,
      });
    }
    if (bucket.purchases > 0) {
      segments.push({
        key: `${bucket.ruleKey}-purchase`,
        label: `${bucket.label} purchases`,
        color: FUND_COLORS.purchase,
        pct: (bucket.purchases / income) * 100,
      });
    }
    if (bucket.unexpected > 0) {
      segments.push({
        key: `${bucket.ruleKey}-unexpected`,
        label: `${bucket.label} unexpected`,
        color: FUND_COLORS.unexpected,
        pct: (bucket.unexpected / income) * 100,
      });
    }
  }

  if (props.headroom.moneyLeft > 0) {
    segments.push({
      key: 'unassigned',
      label: 'Unassigned',
      color: FUND_COLORS.unassigned,
      pct: (props.headroom.moneyLeft / income) * 100,
    });
  } else if (props.headroom.isOverCommitted) {
    segments.push({
      key: 'over',
      label: 'Over budget',
      color: FUND_COLORS.over,
      pct: (Math.abs(props.headroom.moneyLeft) / income) * 100,
    });
  }

  return segments;
});

/** Legend stays at bucket level, with purchase/unexpected colours called out once. */
const ringLegend = computed((): RingSegment[] => {
  const income = props.headroom.income;
  if (income <= 0) return [];

  const legend: RingSegment[] = [];
  let anyPurchases = 0;
  let anyUnexpected = 0;

  for (const bucket of props.headroom.buckets) {
    if (bucket.committed <= 0) continue;
    legend.push({
      key: bucket.ruleKey,
      label: bucket.label,
      color: ringColorForRuleKey(bucket.ruleKey, bucket.color),
      pct: (bucket.committed / income) * 100,
    });
    anyPurchases += bucket.purchases;
    anyUnexpected += bucket.unexpected;
  }

  if (anyPurchases > 0) {
    legend.push({
      key: 'purchases',
      label: 'Purchases',
      color: FUND_COLORS.purchase,
      pct: (anyPurchases / income) * 100,
    });
  }
  if (anyUnexpected > 0) {
    legend.push({
      key: 'unexpected',
      label: 'Unexpected',
      color: FUND_COLORS.unexpected,
      pct: (anyUnexpected / income) * 100,
    });
  }

  if (props.headroom.moneyLeft > 0) {
    legend.push({
      key: 'unassigned',
      label: 'Unassigned',
      color: FUND_COLORS.unassigned,
      pct: (props.headroom.moneyLeft / income) * 100,
    });
  } else if (props.headroom.isOverCommitted) {
    legend.push({
      key: 'over',
      label: 'Over budget',
      color: FUND_COLORS.over,
      pct: (Math.abs(props.headroom.moneyLeft) / income) * 100,
    });
  }

  return legend;
});

const ringStyle = computed(() => {
  const income = props.headroom.income;
  if (income <= 0 || ringSegments.value.length === 0) {
    return {
      background: `conic-gradient(${TRACK_COLOR} 0 100%)`,
    };
  }

  let cursor = 0;
  const stops: string[] = [];

  for (const seg of ringSegments.value) {
    const end = Math.min(100, cursor + seg.pct);
    if (end > cursor) {
      stops.push(`${seg.color} ${cursor}% ${end}%`);
      cursor = end;
    }
  }

  if (cursor < 100) {
    stops.push(`${TRACK_COLOR} ${cursor}% 100%`);
  }

  return {
    background: `conic-gradient(from -90deg, ${stops.join(', ')})`,
  };
});

const tiers = computed(() => props.headroom.spendingTiers.tiers);

const moneyLeftClass = computed(() => {
  const active = props.headroom.spendingTiers.activeTierKey;
  if (props.headroom.isOverCommitted || active === 'over') return 'money-left-hero--over';
  if (active === 'savings') return 'money-left-hero--savings-danger';
  if (active === 'needs') return 'money-left-hero--needs-warning';
  if (props.headroom.moneyLeft > 0) return 'money-left-hero--positive';
  return 'money-left-hero--neutral';
});

const memorableLine = computed(() => props.headroom.spendingTiers.memorableLine);

function tierStatusClass(status: SpendingTierStatus): string {
  return `spend-tier--${status}`;
}
</script>

<template>
  <component
    :is="embedded ? 'div' : 'section'"
    class="money-left-hero"
    :class="[
      moneyLeftClass,
      embedded ? 'money-left-hero--embedded' : 'card',
      variant === 'snapshot' ? 'money-left-hero--snapshot' : 'money-left-hero--planning',
    ]"
  >
    <div class="money-left-hero__body" :class="embedded ? '' : 'card-body'">
      <div class="money-left-hero__main">
        <div class="money-left-hero__ring-col">
          <div class="money-left-hero__ring" :style="ringStyle">
            <div class="money-left-hero__ring-hole">
              <span class="money-left-hero__eyebrow">Unassigned</span>
              <span class="money-left-hero__amount">{{ formatMoney(headroom.moneyLeft) }}</span>
              <span class="money-left-hero__month">{{ monthLabel }}</span>
            </div>
          </div>
          <ul
            v-if="ringLegend.length"
            class="money-left-hero__ring-legend list-unstyled mb-0"
            aria-label="Income breakdown"
          >
            <li
              v-for="seg in ringLegend"
              :key="seg.key"
              class="money-left-hero__ring-legend-item"
            >
              <span
                class="money-left-hero__ring-swatch"
                :style="{ background: seg.color }"
                aria-hidden="true"
              />
              <span class="money-left-hero__ring-legend-label">{{ seg.label }}</span>
              <span class="money-left-hero__ring-legend-pct">{{ formatPercent(seg.pct) }}%</span>
            </li>
          </ul>
        </div>

        <div class="money-left-hero__details">
          <p class="money-left-hero__headline mb-2">
            <template v-if="headroom.isOverCommitted">
              You’re over budget by
              <strong>{{ formatMoney(Math.abs(headroom.moneyLeft)) }}</strong>
              this month.
            </template>
            <template v-else-if="headroom.moneyLeft > 0">
              <template v-if="headroom.spendingTiers.activeTierKey === 'wants'">
                You have <strong>{{ formatMoney(headroom.moneyLeft) }}</strong>
                unassigned — start with wants.
              </template>
              <template v-else-if="headroom.spendingTiers.activeTierKey === 'needs'">
                Wants are used up; <strong>{{ formatMoney(headroom.moneyLeft) }}</strong>
                left is in needs cushion territory.
              </template>
              <template v-else-if="headroom.spendingTiers.activeTierKey === 'savings'">
                <strong class="money-left-hero__warn-text">Caution:</strong>
                spending is bleeding into savings —
                <strong>{{ formatMoney(headroom.moneyLeft) }}</strong> left overall.
              </template>
              <template v-else>
                After planned costs, <strong>{{ formatMoney(headroom.moneyLeft) }}</strong>
                remains.
              </template>
            </template>
            <template v-else>
              Every dollar is allocated — nothing left unassigned.
            </template>
          </p>

          <p v-if="memorableLine" class="money-left-hero__remember mb-3">
            {{ memorableLine }}
          </p>

          <div class="spend-tier-stack" role="list" aria-label="Spending tiers">
            <template v-for="(tier, index) in tiers" :key="tier.key">
              <div
                role="listitem"
                class="spend-tier"
                :class="[
                  tierStatusClass(tier.status),
                  `spend-tier--key-${tier.key}`,
                  { 'spend-tier--active': headroom.spendingTiers.activeTierKey === tier.key },
                ]"
              >
                <div class="spend-tier__header">
                  <span class="spend-tier__step">{{ index + 1 }}</span>
                  <div class="spend-tier__titles">
                    <span class="spend-tier__label">{{ tier.label }}</span>
                    <span class="spend-tier__hint">{{ tier.hint }}</span>
                  </div>
                  <span class="spend-tier__amount">{{ formatMoney(tier.amount) }}</span>
                </div>
                <div
                  v-if="tier.bleedIn > 0"
                  class="spend-tier__bleed"
                  :class="{ 'spend-tier__bleed--danger': tier.key === 'savings' }"
                >
                  <span v-if="tier.key === 'needs'">
                    ↓ {{ formatMoney(tier.bleedIn) }} from wants overspend
                  </span>
                  <span v-else-if="tier.key === 'savings'">
                    ↓ {{ formatMoney(tier.bleedIn) }} from needs — avoid spending savings
                  </span>
                </div>
                <button
                  v-if="hasDrilldown(tier.key)"
                  type="button"
                  class="spend-tier__toggle"
                  :aria-expanded="!!expandedTiers[tier.key]"
                  @click="toggleTier(tier.key)"
                >
                  {{ expandedTiers[tier.key] ? 'Hide' : 'Show' }} breakdown
                </button>
                <div v-if="expandedTiers[tier.key] && hasDrilldown(tier.key)" class="spend-tier__drill">
                  <ul
                    v-if="lineItemsFor(tier.key).length"
                    class="spend-tier__lines list-unstyled mb-0"
                  >
                    <li
                      v-for="li in lineItemsFor(tier.key)"
                      :key="li.id"
                      class="spend-tier__line"
                    >
                      <span class="spend-tier__line-name">
                        <span
                          class="spend-tier__line-swatch"
                          :style="{ background: li.color }"
                          aria-hidden="true"
                        />
                        {{ li.label }}
                      </span>
                      <span class="spend-tier__line-amt">{{ formatMoney(li.planned) }} planned</span>
                    </li>
                  </ul>

                  <div v-if="spendFor(tier.key)" class="spend-tier__spend-block">
                    <p class="spend-tier__spend small mb-1">
                      Reduced your leftover by
                      <strong>{{ formatMoney(spentTotal(tier.key)) }}</strong>
                      <template
                        v-if="spendFor(tier.key)!.purchases > 0 && spendFor(tier.key)!.unexpected > 0"
                      >
                        —
                        <span class="spend-tier__spend-purchase">
                          {{ formatMoney(spendFor(tier.key)!.purchases) }} purchases
                        </span>
                        ·
                        <span class="spend-tier__spend-unexpected">
                          {{ formatMoney(spendFor(tier.key)!.unexpected) }} unexpected
                        </span>
                      </template>
                    </p>
                    <ul v-if="itemsFor(tier.key).length" class="impact-txn-list list-unstyled mb-0">
                      <li
                        v-for="item in itemsFor(tier.key)"
                        :key="item.kind + '-' + item.id"
                        class="impact-txn"
                      >
                        <span
                          class="impact-txn__dot"
                          :class="
                            item.kind === 'purchase'
                              ? 'impact-txn__dot--purchase'
                              : 'impact-txn__dot--unexpected'
                          "
                          aria-hidden="true"
                        />
                        <span class="impact-txn__main">
                          <span class="impact-txn__label">{{ item.label }}</span>
                          <span class="impact-txn__meta">
                            {{ item.kind === 'purchase' ? 'Purchase' : 'Unexpected' }}
                            <template v-if="txDate(item.date)"> · {{ txDate(item.date) }}</template>
                          </span>
                        </span>
                        <span class="impact-txn__amt">{{ formatMoney(item.amount) }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div
                v-if="index < tiers.length - 1"
                class="spend-tier-connector"
                :class="{
                  'spend-tier-connector--bleeding': tiers[index + 1].bleedIn > 0,
                  'spend-tier-connector--danger':
                    tiers[index + 1].key === 'savings' && tiers[index + 1].bleedIn > 0,
                }"
                aria-hidden="true"
              />
            </template>
          </div>

          <dl
            v-if="variant === 'planning'"
            class="money-left-hero__stats row g-2 mb-0 small mt-3"
          >
            <div class="col-4">
              <dt>Income</dt>
              <dd class="mb-0 fw-semibold">{{ formatMoney(headroom.income) }}</dd>
            </div>
            <div class="col-4">
              <dt>Committed</dt>
              <dd class="mb-0 fw-semibold">{{ formatMoney(headroom.committedTotal) }}</dd>
            </div>
            <div class="col-4">
              <dt>Used</dt>
              <dd class="mb-0 fw-semibold">{{ formatPercent(headroom.usedPct) }}%</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </component>
</template>
