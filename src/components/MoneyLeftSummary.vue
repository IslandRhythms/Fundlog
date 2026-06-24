<script setup lang="ts">
import { computed } from 'vue';
import type { BudgetHeadroomResult, SpendingTierStatus } from '../shared/budgetHeadroom';
import { formatMoney as formatMoneyExact, formatPercent } from '../shared/formatMoney';
import { FUND_COLORS, ringColorForRuleKey } from '../shared/fundColors';

const props = withDefaults(
  defineProps<{
    headroom: BudgetHeadroomResult;
    currencyCode: string;
    monthLabel: string;
    variant?: 'snapshot' | 'planning';
    embedded?: boolean;
  }>(),
  {
    variant: 'planning',
    embedded: false,
  },
);

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

const ringSegments = computed((): RingSegment[] => {
  const income = props.headroom.income;
  if (income <= 0) return [];

  const segments: RingSegment[] = [];

  for (const bucket of props.headroom.buckets) {
    if (bucket.committed <= 0) continue;
    segments.push({
      key: bucket.ruleKey,
      label: bucket.label,
      color: ringColorForRuleKey(bucket.ruleKey, bucket.color),
      pct: (bucket.committed / income) * 100,
    });
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
            v-if="ringSegments.length"
            class="money-left-hero__ring-legend list-unstyled mb-0"
            aria-label="Income breakdown"
          >
            <li
              v-for="seg in ringSegments"
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
