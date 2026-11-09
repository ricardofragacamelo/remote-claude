import { describe, expect, it } from 'vitest';

import {
  dateInputToExpiresAt,
  dateInputValueOf,
  expiryFromShortcut,
  expiryShortcutsFor,
} from '@/features/permission/lib/rule-expiry-shortcuts';

describe('the shortcuts a rule’s decision offers', () => {
  it('gives allow three', () => {
    expect(expiryShortcutsFor('allow').map((shortcut) => shortcut.days)).toEqual([7, 30, 90]);
  });

  it('gives deny a fourth, longer one', () => {
    expect(expiryShortcutsFor('deny').map((shortcut) => shortcut.days)).toEqual([7, 30, 90, 365]);
  });
});

describe('what a shortcut picks', () => {
  it('counts from now, never from the rule’s own grant (D-14)', () => {
    const now = new Date('2026-09-20T10:00:00.000Z');

    expect(expiryFromShortcut(7, now).toISOString()).toBe('2026-09-27T10:00:00.000Z');
  });
});

describe('the free date field', () => {
  it('reads back the day an instant it sent falls on, in this browser’s own zone', () => {
    const iso = dateInputToExpiresAt('2026-09-20')!;

    expect(dateInputValueOf(iso)).toBe('2026-09-20');
  });

  it('says there is no date for a value that does not parse', () => {
    expect(dateInputValueOf('not-a-date')).toBe('');
  });

  it('sends the end of the day somebody picked, in this browser’s own zone', () => {
    const iso = dateInputToExpiresAt('2026-09-20')!;
    const local = new Date(iso);

    expect(local.getHours()).toBe(23);
    expect(local.getMinutes()).toBe(59);
    expect(local.getDate()).toBe(20);
  });

  it('says a value that is not a well-formed date cannot be sent', () => {
    expect(dateInputToExpiresAt('')).toBeUndefined();
    expect(dateInputToExpiresAt('20-09-2026')).toBeUndefined();
  });
});
