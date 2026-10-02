import { afterEach, describe, expect, it, vi } from 'vitest';

import { readDiskNow } from '@/features/permission/services/disk-preview.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
});

/** What is on disk now, for the preview of an edit on the card that asks — plan 08, B-29. */
describe('the disk under a preview', () => {
  it('reads the text of the file, in the folder of the tab', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ content: 'now\n' });

    expect(await readDiskNow('/srv/app', '/srv/app/a.ts')).toEqual({
      kind: 'text',
      content: 'now\n',
    });
    expect(get).toHaveBeenCalledWith('/files/content?folder=%2Fsrv%2Fapp&path=%2Fsrv%2Fapp%2Fa.ts');
  });

  it('reads an answer with no text as an empty file', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ content: 7 });

    expect(await readDiskNow('/srv/app', '/srv/app/a.ts')).toEqual({ kind: 'text', content: '' });
  });

  it('says a file that is not there is absent', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      new AppError('FILE_NOT_FOUND', 'files.error.notFound', 'trace-1'),
    );

    expect(await readDiskNow('/srv/app', '/srv/app/new.ts')).toEqual({ kind: 'absent' });
  });

  it('lets any other refusal through', async () => {
    const refusal = new AppError('FILE_TOO_LARGE', 'files.error.tooLarge', 'trace-2');
    vi.spyOn(api, 'get').mockRejectedValue(refusal);

    await expect(readDiskNow('/srv/app', '/srv/app/big.bin')).rejects.toBe(refusal);
  });
});
