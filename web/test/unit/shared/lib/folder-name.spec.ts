import { describe, expect, it } from 'vitest';

import { folderName } from '@/shared/lib/folder-name';

describe('what a person calls a folder', () => {
  it('is the last segment of its path, spaces and all', () => {
    expect(folderName('/srv/projects/my app ')).toBe('my app ');
  });

  it('is the path itself for the root of the disk, which has no last segment', () => {
    expect(folderName('/')).toBe('/');
  });
});
