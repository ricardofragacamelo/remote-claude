import { AppError } from '@/shared/api/errors';
import { formatBytes } from './text';

/**
 * A refusal of a preview's bytes, in the words of a preview: past the download ceiling (`413`), the
 * server's own sentence is the editor's ("larger than this editor opens") — a preview says the
 * ceiling it is past, in the person's units. Any other refusal is as it came.
 */
export function previewError(error: AppError, path: string, locale: string): AppError {
  if (error.code !== 'FILE_TOO_LARGE') {
    return error;
  }

  const limit = error.params['limit'];

  return new AppError(error.code, 'editor.preview.tooLarge', error.traceId, {
    path,
    ...error.params,
    limit: formatBytes(typeof limit === 'number' ? limit : 0, locale),
  });
}
