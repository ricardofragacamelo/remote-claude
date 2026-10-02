import { describe, expect, it } from 'vitest';

import { codeOf, failureOf, isAbsent } from '@adapter/outbound/filesystem/folder-file-system';
import { FilePath, FileNotFoundError, StorageFullError } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';

const entry = FilePath.create(WorkspacePath.create('/srv/app'), 'a.ts');

describe('the refusals of the operating system, as the domain says them', () => {
  it('reads the code of a failure, and nothing from what is not one', () => {
    expect(codeOf(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe('ENOENT');
    expect(codeOf('ENOENT')).toBe('');
    expect(codeOf(null)).toBe('');
    expect(codeOf({ code: 42 })).toBe('');
  });

  it('tells absence from a failure to look', () => {
    expect(isAbsent({ code: 'ENOTDIR' })).toBe(true);
    expect(isAbsent({ code: 'EACCES' })).toBe(false);
  });

  it('maps what it knows, and leaves the rest as it is', () => {
    const unknown = { code: 'EIO' };

    expect(failureOf(entry, { code: 'ENOENT' })).toBeInstanceOf(FileNotFoundError);
    expect(failureOf(entry, { code: 'EDQUOT' })).toBeInstanceOf(StorageFullError);
    expect(failureOf(entry, unknown)).toBe(unknown);
  });
});
