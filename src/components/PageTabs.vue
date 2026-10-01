<script setup lang="ts" generic="K extends string">
import { onMounted, watch } from 'vue';

const props = defineProps<{
  tabs: { key: K; label: string }[];
  /** Remembers the last tab used on this page. */
  storageKey: string;
  /** Accessible name for the tab list. */
  label: string;
}>();

const active = defineModel<K>({ required: true });

function storageId() {
  return `fundlog-tab:${props.storageKey}`;
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(storageId());
    const match = props.tabs.find((t) => t.key === stored);
    if (match) active.value = match.key;
  } catch {
    /* ignore */
  }
});

watch(active, (key) => {
  try {
    localStorage.setItem(storageId(), key);
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <ul class="nav nav-tabs flex-nowrap overflow-x-auto mb-3" role="tablist" :aria-label="label">
    <li v-for="t in tabs" :key="t.key" class="nav-item" role="presentation">
      <button
        type="button"
        class="nav-link text-nowrap"
        :class="{ active: active === t.key }"
        role="tab"
        :aria-selected="active === t.key"
        @click="active = t.key"
      >
        {{ t.label }}
      </button>
    </li>
  </ul>
</template>
