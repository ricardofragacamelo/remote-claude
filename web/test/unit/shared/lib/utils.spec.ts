import { describe, expect, it } from 'vitest';

import { cn } from '@/shared/lib/utils';
import { newTraceId } from '@/shared/lib/trace';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it.each([
    ['a condition that is false', false],
    ['undefined', undefined],
    ['null', null],
  ])('drops %s', (_case, value) => {
    expect(cn('a', value)).toBe('a');
  });

  it('resolves a Tailwind conflict in favour of the last one, which is what a reader expects', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});

describe('newTraceId', () => {
  it('produces a distinct trace every time', () => {
    expect(newTraceId()).not.toBe(newTraceId());
  });

  it('produces a UUID, which is what the backend echoes back', () => {
    expect(newTraceId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
