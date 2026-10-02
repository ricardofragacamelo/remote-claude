import { describe, expect, it } from 'vitest';

import { toUploadDto } from '@adapter/inbound/http/files/file-transfer.dto';
import { Etag, FileExistsError, FilePath } from '@domain/files';
import { DomainError } from '@domain/shared';
import { WorkspacePath } from '@domain/workspace';

const folder = WorkspacePath.create('/srv/app');

/** A refusal that has nothing to say beyond its code — the envelope then carries no `params`. */
class Bare extends DomainError {
  readonly code = 'CONFLICT';
  readonly messageKey = 'common.error.conflict';

  constructor() {
    super('a refusal with nothing to add');
  }
}

/** The answer of an upload, item by item — plan 07, B-49, doc 04 `207`. */
describe('toUploadDto', () => {
  it('gives a failed item the envelope of its error, and a written one its version', () => {
    const dto = toUploadDto([
      {
        path: FilePath.create(folder, 'a.txt'),
        status: 'created',
        etag: Etag.of(Buffer.from('a')),
      },
      {
        path: FilePath.create(folder, 'b.txt'),
        status: 'failed',
        error: new FileExistsError('b.txt', null),
      },
      { path: FilePath.create(folder, 'c.txt'), status: 'failed', error: new Bare() },
    ]);

    expect(dto.items).toEqual([
      { path: 'a.txt', status: 'created', etag: Etag.of(Buffer.from('a')).value },
      {
        path: 'b.txt',
        status: 'failed',
        error: {
          code: 'FILE_EXISTS',
          messageKey: 'files.error.exists',
          params: { path: 'b.txt', currentEtag: null },
        },
      },
      {
        path: 'c.txt',
        status: 'failed',
        error: { code: 'CONFLICT', messageKey: 'common.error.conflict' },
      },
    ]);
  });
});
