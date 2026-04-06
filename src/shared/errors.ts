/** Best-effort message from IPC errors, SQLite failures, or unknown throws. */
export function errorMessageFromUnknown(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return fallback;
}
