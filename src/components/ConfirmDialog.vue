<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  confirmOpen,
  confirmState,
  resolveConfirm,
} from '../shared/confirmAction';

/** Bootstrap markup without Modal JS so this can stack over an already-open modal. */

const route = useRoute();
const dialogEl = ref<HTMLElement | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);

function cancel() {
  resolveConfirm(false);
}

function confirm() {
  resolveConfirm(true);
}

function onKeydown(e: KeyboardEvent) {
  if (!confirmOpen.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    cancel();
    return;
  }
  if (e.key !== 'Tab' || !dialogEl.value) return;
  const focusable = dialogEl.value.querySelectorAll<HTMLElement>('button:not([disabled])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function onFocusIn(e: FocusEvent) {
  if (!confirmOpen.value || !dialogEl.value) return;
  e.stopImmediatePropagation();
  const t = e.target;
  if (t instanceof Node && dialogEl.value.contains(t)) return;
  confirmBtn.value?.focus();
}

watch(
  confirmOpen,
  async (open) => {
    if (!open) return;
    await nextTick();
    confirmBtn.value?.focus();
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    if (confirmOpen.value) cancel();
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true);
  document.addEventListener('focusin', onFocusIn, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusin', onFocusIn, true);
});
</script>

<template>
  <Teleport to="body">
    <template v-if="confirmOpen && confirmState">
      <div class="modal-backdrop fade show confirm-dialog-backdrop" />
      <div
        id="fundlogConfirmDialog"
        ref="dialogEl"
        class="modal fade show d-block confirm-dialog"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fundlogConfirmDialogLabel"
        aria-describedby="fundlogConfirmDialogBody"
        @click.self="cancel"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-danger border-opacity-25">
              <h5 id="fundlogConfirmDialogLabel" class="modal-title text-danger">
                {{ confirmState.title }}
              </h5>
              <button type="button" class="btn-close" aria-label="Close" @click="cancel" />
            </div>
            <div id="fundlogConfirmDialogBody" class="modal-body">
              <p :class="confirmState.detail ? 'mb-2' : 'mb-0'">
                {{ confirmState.message }}
              </p>
              <p v-if="confirmState.detail" class="small text-muted mb-0">
                {{ confirmState.detail }}
              </p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="cancel">Cancel</button>
              <button
                ref="confirmBtn"
                type="button"
                class="btn btn-danger"
                @click="confirm"
              >
                {{ confirmState.confirmLabel }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.confirm-dialog-backdrop {
  z-index: 1060;
}

.confirm-dialog {
  z-index: 1065;
}
</style>
