import { localInputOf } from '@/shared/lib/local-input';
import type { PermissionDecision } from '../types/permission';

const DAY_MS = 24 * 60 * 60 * 1_000;

/** One shortcut of the extend/shorten dialog: how many days from now, and its label's key. */
export interface ExpiryShortcut {
  readonly days: number;
  readonly labelKey: string;
}

const SHORTCUTS: readonly ExpiryShortcut[] = [
  { days: 7, labelKey: 'permission.ruleExpiry.shortcut7' },
  { days: 30, labelKey: 'permission.ruleExpiry.shortcut30' },
  { days: 90, labelKey: 'permission.ruleExpiry.shortcut90' },
];

/** `deny` alone gets a fourth, longer shortcut — it lives longer than `allow` to begin with (D-04). */
const DENY_SHORTCUT: ExpiryShortcut = { days: 365, labelKey: 'permission.ruleExpiry.shortcut365' };

/** The shortcuts this rule's decision offers — `allow`'s three, or `deny`'s four. */
export function expiryShortcutsFor(decision: PermissionDecision): readonly ExpiryShortcut[] {
  return decision === 'deny' ? [...SHORTCUTS, DENY_SHORTCUT] : SHORTCUTS;
}

/** The instant a shortcut picks, counted from now — never from the rule's own grant (D-14). */
export function expiryFromShortcut(days: number, now: Date): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** A `date` input's value, in the zone of this browser, for an ISO instant. `''` for none. */
export function dateInputValueOf(iso: string): string {
  return localInputOf(iso, 10);
}

/**
 * A `date` input's value as the ISO instant to send — the **end** of that day, in this browser's
 * zone, so the rule still answers through the whole day somebody picked. `undefined` for a value
 * that is not a well-formed date.
 */
export function dateInputToExpiresAt(value: string): string | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (parts === null) {
    return undefined;
  }

  // The regex above already guarantees three plain digit groups — `new Date(y, m, d, ...)` never
  // returns an Invalid Date for finite numeric arguments, only overflows/wraps them, so there is no
  // "not a real date" branch left to guard here.
  const [, year, month, day] = parts;
  const endOfDay = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);

  return endOfDay.toISOString();
}
