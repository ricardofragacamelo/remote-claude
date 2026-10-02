/** The units a relative time is said in, largest first, with how many seconds each holds. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/**
 * How long ago something happened, in the reader's language — "3 min ago", "há 3 min".
 *
 * In the largest unit that fits, rounded down: a conversation written 119 s ago was written one
 * minute ago, not two. A moment in the future reads as now: the clocks of two machines disagree, and
 * "in 2 s" about a write that already happened is the screen being wrong.
 */
export function ago(seconds: number, locale: string): string {
  const elapsed = Math.max(0, Math.floor(seconds));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const [unit, size] = UNITS.find(([, inUnit]) => elapsed >= inUnit) ?? ['second', 1];

  return format.format(-Math.floor(elapsed / size), unit);
}

/** How long ago an ISO instant was, by `now` — the same words as {@link ago}. */
export function agoFrom(iso: string, now: Date, locale: string): string {
  const at = Date.parse(iso);

  return ago(Number.isNaN(at) ? 0 : (now.getTime() - at) / 1_000, locale);
}
