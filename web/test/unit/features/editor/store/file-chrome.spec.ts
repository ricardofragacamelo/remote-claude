import { describe, expect, it } from 'vitest';

import { fileChrome, fileChromeFor } from '@/features/editor/store/file-chrome';
import type { FileChrome } from '@/features/editor/types/editor';

function aChrome(id: string, extension: string): FileChrome {
  return {
    id,
    position: 100,
    matches: (path) => path.endsWith(extension),
    component: () => null,
  };
}

describe('fileChromeFor — plan 11, B-17', () => {
  it('answers null for a path nobody registered chrome for', () => {
    expect(fileChromeFor('a.ts')).toBeNull();
  });

  it('answers the chrome whose own `matches` picks the path', () => {
    const undo = fileChrome.register(aChrome('code-search', '.code-search'));

    expect(fileChromeFor('results.code-search')).toMatchObject({ id: 'code-search' });
    expect(fileChromeFor('a.ts')).toBeNull();

    undo();
    expect(fileChromeFor('results.code-search')).toBeNull();
  });
});
