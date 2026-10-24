import { describe, expect, it } from 'vitest';

import { filterByName } from '@/engines/claude/settings/lib/filter-by-name';

describe('filterByName — plan 13, B-33, B-36', () => {
  const items = [{ name: 'Review' }, { name: 'draft' }, { name: 'summarize' }];

  it('keeps everything with no search', () => {
    expect(filterByName(items, '', (item) => item.name)).toEqual(items);
  });

  it('narrows by a case-insensitive substring', () => {
    expect(filterByName(items, 'rev', (item) => item.name)).toEqual([{ name: 'Review' }]);
  });

  it('trims the search before matching', () => {
    expect(filterByName(items, '  draft  ', (item) => item.name)).toEqual([{ name: 'draft' }]);
  });

  it('is empty when nothing matches', () => {
    expect(filterByName(items, 'zzz', (item) => item.name)).toEqual([]);
  });
});
