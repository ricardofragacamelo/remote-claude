import { describe, expect, it } from 'vitest';

import { InMemoryPathLock } from '@shared/concurrency/in-memory-path-lock';
import {
  checkOptionalIfMatch,
  confirmSensitive,
  underLocks,
} from '@application/files/write-preconditions';
import { Etag, FileChangedError, FilePath, PreconditionRequiredError } from '@domain/files';
import { WorkspacePath } from '@domain/workspace';

const folder = WorkspacePath.create('/srv/app');
const path = (relative: string): FilePath => FilePath.create(folder, relative);
const one = Etag.of(Buffer.from('one'));

describe('the preconditions of a write', () => {
  it('asks the second step of any entry that reaches a sensitive file — D-15', () => {
    expect(() => confirmSensitive(false, path('src'), path('.claude'))).toThrow(
      PreconditionRequiredError,
    );
    expect(confirmSensitive(true, path('.mcp.json'))).toBe(true);
    expect(confirmSensitive(false, path('src'))).toBe(false);
  });

  it('checks an optional If-Match only when it names a version — S-98', () => {
    expect(() => checkOptionalIfMatch(path('a'), null, null)).not.toThrow();
    expect(() => checkOptionalIfMatch(path('a'), '*', null)).not.toThrow();
    expect(() => checkOptionalIfMatch(path('a'), one.value, one)).not.toThrow();
    expect(() => checkOptionalIfMatch(path('a'), one.value, null)).toThrow(FileChangedError);
    expect(() => checkOptionalIfMatch(path('a'), '"other"', one)).toThrow(FileChangedError);
  });

  it('holds every lock in one order, each once, and runs with none to hold', async () => {
    const lock = new InMemoryPathLock();
    const taken: string[] = [];
    const watching = {
      run: <T>(key: string, work: () => Promise<T>): Promise<T> => {
        taken.push(key);
        return lock.run(key, work);
      },
    };

    expect(await underLocks(watching, ['/b', '/a', '/b'], () => Promise.resolve('done'))).toBe(
      'done',
    );
    expect(taken).toEqual(['/a', '/b']);
    expect(await underLocks(watching, [], () => Promise.resolve(1))).toBe(1);
  });
});
