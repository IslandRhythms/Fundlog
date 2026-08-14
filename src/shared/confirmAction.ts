/** Confirm via Electron dialog (avoids Windows focus bug from window.confirm). */
export async function confirmAction(
  message: string,
  opts?: { title?: string; detail?: string },
): Promise<boolean> {
  if (!window.fundlog?.dialog?.confirm) {
    return window.confirm(message);
  }
  return window.fundlog.dialog.confirm({
    message,
    title: opts?.title ?? 'Confirm',
    detail: opts?.detail,
  });
}
