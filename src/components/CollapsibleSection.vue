<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    meta?: string;
    defaultExpanded?: boolean;
    storageKey?: string;
    card?: boolean;
    bare?: boolean;
    integrated?: boolean;
    headingClass?: string;
  }>(),
  {
    defaultExpanded: true,
    card: true,
    bare: false,
    integrated: false,
    headingClass: 'h5',
  },
);

const expanded = ref(props.defaultExpanded);

function storageId() {
  return props.storageKey ? `fundlog-collapse:${props.storageKey}` : null;
}

onMounted(() => {
  const id = storageId();
  if (!id) return;
  try {
    const stored = localStorage.getItem(id);
    if (stored === '0') expanded.value = false;
    else if (stored === '1') expanded.value = true;
  } catch {
    /* ignore */
  }
});

watch(expanded, (open) => {
  const id = storageId();
  if (!id) return;
  try {
    localStorage.setItem(id, open ? '1' : '0');
  } catch {
    /* ignore */
  }
});

function toggle() {
  expanded.value = !expanded.value;
}

const panelId = `collapse-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
  <section
    class="collapsible-section"
    :class="{
      'collapsible-section--card': card && !bare && !integrated,
      'collapsible-section--integrated': integrated,
      'collapsible-section--bare': bare && !integrated,
      'collapsible-section--collapsed': !expanded,
      'page-section-card': card && !bare && !integrated,
    }"
  >
    <button
      type="button"
      class="collapsible-section__toggle"
      :class="{
        'collapsible-section__toggle--expanded': expanded,
        'collapsible-section__toggle--integrated': integrated,
      }"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      @click="toggle"
    >
      <div class="collapsible-section__toggle-main">
        <component :is="headingClass" class="collapsible-section__title mb-0">
          {{ title }}
        </component>
        <span v-if="meta" class="collapsible-section__meta">{{ meta }}</span>
      </div>
      <span
        class="collapsible-section__chevron budgets-collapse-chevron"
        :class="{ 'budgets-collapse-chevron--collapsed': !expanded }"
        aria-hidden="true"
      />
    </button>

    <div
      v-show="expanded"
      :id="panelId"
      class="collapsible-section__body"
      :class="{ 'collapsible-section__body--integrated': integrated }"
      role="region"
      :aria-label="title"
    >
      <slot />
    </div>
  </section>
</template>
