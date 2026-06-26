<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    vendors: string[];
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'md',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const ADD_NEW = '__add_new_vendor__';

const mode = ref<'select' | 'new'>(props.vendors.length ? 'select' : 'new');
const newInput = ref<HTMLInputElement | null>(null);

const selectClass = computed(() =>
  props.size === 'sm' ? 'form-select form-select-sm' : 'form-select',
);
const inputClass = computed(() =>
  props.size === 'sm' ? 'form-control form-control-sm' : 'form-control',
);

/** Show the typed value in the select only when it matches a known vendor. */
const selectValue = computed(() =>
  props.vendors.includes(props.modelValue) ? props.modelValue : '',
);

async function onSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (value === ADD_NEW) {
    mode.value = 'new';
    emit('update:modelValue', '');
    await nextTick();
    newInput.value?.focus();
    return;
  }
  emit('update:modelValue', value);
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function useExisting() {
  mode.value = 'select';
  emit('update:modelValue', '');
}
</script>

<template>
  <div class="vendor-picker">
    <select
      v-if="mode === 'select'"
      :class="selectClass"
      :value="selectValue"
      @change="onSelect"
    >
      <option value="">No vendor</option>
      <option v-for="vendor in vendors" :key="vendor" :value="vendor">{{ vendor }}</option>
      <option :value="ADD_NEW">+ Add new vendor…</option>
    </select>
    <div v-else class="vendor-picker__new">
      <input
        ref="newInput"
        :class="inputClass"
        :value="modelValue"
        type="text"
        placeholder="e.g. Raising Cane's"
        @input="onInput"
      />
      <button
        v-if="vendors.length"
        type="button"
        class="btn btn-link btn-sm vendor-picker__back"
        @click="useExisting"
      >
        Choose existing vendor
      </button>
    </div>
  </div>
</template>
