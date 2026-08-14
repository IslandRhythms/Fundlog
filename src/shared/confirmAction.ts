import { ref, shallowRef } from 'vue';

export type ConfirmActionOptions = {
  title?: string;
  detail?: string;
  confirmLabel?: string;
};

type ConfirmDialogContent = {
  message: string;
  title: string;
  detail?: string;
  confirmLabel: string;
};

type PendingConfirm = ConfirmDialogContent & {
  resolve: (ok: boolean) => void;
};

let pending: PendingConfirm | null = null;
let previousFocus: HTMLElement | null = null;

export const confirmOpen = ref(false);
export const confirmState = shallowRef<ConfirmDialogContent | null>(null);

export function confirmAction(
  message: string,
  opts?: ConfirmActionOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (pending) {
      pending.resolve(false);
    } else {
      const el = document.activeElement;
      previousFocus = el instanceof HTMLElement ? el : null;
    }

    const content: ConfirmDialogContent = {
      message,
      title: opts?.title?.trim() || 'Confirm',
      detail: opts?.detail?.trim() || undefined,
      confirmLabel: opts?.confirmLabel?.trim() || 'OK',
    };
    pending = { ...content, resolve };
    confirmState.value = content;
    confirmOpen.value = true;
  });
}

export function resolveConfirm(ok: boolean): void {
  const current = pending;
  if (!current) return;
  pending = null;
  confirmOpen.value = false;
  confirmState.value = null;
  const toFocus = previousFocus;
  previousFocus = null;
  current.resolve(ok);
  toFocus?.focus();
}
