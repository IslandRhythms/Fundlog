/**
 * Must use the same Bootstrap runtime as `bootstrap.bundle.min.js` (window.bootstrap).
 * Importing `Modal` from the `bootstrap` ESM package creates a second instance registry
 * and breaks hide/show (stuck backdrop, UI blocked).
 */
type ModalInstance = { hide: () => void };

export function showBsModal(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;

  const ModalApi = (
    window as Window & {
      bootstrap?: { Modal: { getOrCreateInstance: (element: Element) => { show: () => void } } };
    }
  ).bootstrap?.Modal;

  ModalApi?.getOrCreateInstance(el).show();
}

export function hideBsModal(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;

  const ModalApi = (
    window as Window & {
      bootstrap?: { Modal: { getInstance: (element: Element) => ModalInstance | null } };
    }
  ).bootstrap?.Modal;

  const inst = ModalApi?.getInstance(el);
  if (inst) {
    inst.hide();
    return;
  }

  /* No instance (e.g. timing); clear stuck modal UI */
  el.classList.remove('show');
  (el as HTMLElement).style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  el.removeAttribute('aria-modal');
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
}
