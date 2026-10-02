import { DomainError } from '@domain/shared';

/**
 * The disk is full, or the quota is (`ENOSPC`, `EDQUOT`) — `507`.
 *
 * Nothing half-written is left behind: the original is intact and the temporary removed.
 */
export class StorageFullError extends DomainError {
  readonly code = 'STORAGE_FULL';
  readonly messageKey = 'files.error.storageFull';

  constructor(path: string) {
    super(`no space left to write ${path}`, { path });
  }
}
