/**
 * What a session cost, as a person reads money — the contract writes it as a string of dollars, and
 * a turn can cost a fraction of a cent, so four decimals at most.
 */
export function formatUsd(costUsd: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(Number(costUsd));
}
