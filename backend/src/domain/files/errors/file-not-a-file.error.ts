import { DomainError } from '@domain/shared';

/**
 * Contents asked of something that has none to give — a folder, a FIFO, a socket, a device.
 *
 * `422`: the request is understood and impossible. A FIFO in particular is never read: opening one
 * for reading would wait for a writer that may never come.
 */
export class FileNotAFileError extends DomainError {
  readonly code = 'FILE_NOT_A_FILE';
  readonly messageKey = 'files.error.notAFile';

  constructor(path: string) {
    super(`${path} is not a regular file`, { path });
  }
}
