const AMOUNT_OPTS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export function formatMoney(amount: number, currencyCode = 'USD'): string {
  const code = currencyCode?.trim() || 'USD';
  try {
    return amount.toLocaleString(undefined, {
      style: 'currency',
      currency: code,
      ...AMOUNT_OPTS,
    });
  } catch {
    return `${amount.toLocaleString(undefined, AMOUNT_OPTS)} ${code}`;
  }
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, AMOUNT_OPTS);
}

export function formatPercent(value: number): string {
  return value.toLocaleString(undefined, AMOUNT_OPTS);
}
