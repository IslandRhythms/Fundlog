/** High-contrast semantic palette — each role uses a distinct hue family. */
export const FUND_COLORS = {
  unassigned: '#06b6d4',
  needs: '#2563eb',
  wants: '#db2777',
  savings: '#d97706',
  purchase: '#7c3aed',
  unexpected: '#ea580c',
  over: '#ef4444',
  goalSavings: '#d97706',
} as const;

export function ringColorForRuleKey(ruleKey: string, fallback: string): string {
  if (ruleKey === 'needs') return FUND_COLORS.needs;
  if (ruleKey === 'wants') return FUND_COLORS.wants;
  if (ruleKey === 'savingsDebt') return FUND_COLORS.savings;
  return fallback;
}
