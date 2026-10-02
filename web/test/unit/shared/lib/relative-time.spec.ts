import { describe, expect, it } from 'vitest';

import { ago, agoFrom } from '@/shared/lib/relative-time';

describe('how long ago, in the reader’s language', () => {
  it.each([
    [0, 'now'],
    [45, '45 sec. ago'],
    [119, '1 min. ago'],
    [7_200, '2 hr. ago'],
    [86_400 * 3, '3 days ago'],
  ])('%d seconds reads as %s', (seconds, said) => {
    expect(ago(seconds, 'en')).toBe(said);
  });

  it('reads a moment in the future as now — two clocks disagree', () => {
    expect(ago(-30, 'en')).toBe(ago(0, 'en'));
  });

  it('speaks Portuguese to whoever reads Portuguese', () => {
    expect(ago(180, 'pt-BR')).toMatch(/3 min/);
  });

  it('counts from an instant, and reads one it cannot parse as now', () => {
    const now = new Date('2026-10-01T12:05:00.000Z');

    expect(agoFrom('2026-10-01T12:00:00.000Z', now, 'en')).toBe(ago(300, 'en'));
    expect(agoFrom('yesterday-ish', now, 'en')).toBe(ago(0, 'en'));
  });
});
