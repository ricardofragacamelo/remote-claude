import { describe, expect, it } from 'vitest';

import { useSearchUi } from '@/features/search/store/ui.store';

describe('useSearchUi — plan 11, B-14', () => {
  it('ignores a second call to stop — only the first one it was ever mounted for takes it out', () => {
    const stop = useSearchUi.getState().mount('/srv/projects/a');
    expect(useSearchUi.getState().mounted).toEqual(['/srv/projects/a']);

    stop();
    expect(useSearchUi.getState().mounted).toEqual([]);

    stop();
    expect(useSearchUi.getState().mounted).toEqual([]);
  });
});
