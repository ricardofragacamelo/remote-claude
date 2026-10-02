import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { isRecord } from '@/shared/lib/json';
import type { DiskNow } from '../lib/edit-preview';

/**
 * A file of the folder as it is on disk **now** — what the card that asks previews an edit against
 * (plan 08, B-29), through the files API of plan 07: the same fence, the same ceilings.
 *
 * A file that is not there is `absent` — a `Write` creating it, or an edit that will not match.
 *
 * @throws {AppError} `FILE_TOO_LARGE`, `FILE_NOT_TEXT` and the rest of what the files API refuses
 */
export async function readDiskNow(folder: string, path: string): Promise<DiskNow> {
  try {
    const body = await api.get<unknown>(
      `/files/content?${new URLSearchParams({ folder, path }).toString()}`,
    );
    const content = isRecord(body) && typeof body['content'] === 'string' ? body['content'] : '';
    return { kind: 'text', content };
  } catch (error) {
    if (error instanceof AppError && error.code === 'FILE_NOT_FOUND') {
      return { kind: 'absent' };
    }
    throw error;
  }
}
