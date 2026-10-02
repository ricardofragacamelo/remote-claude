import { DomainError } from '@domain/shared';

/** What the operating system refused with. */
export type AccessDeniedReason = 'permission' | 'readOnlyFileSystem';

/**
 * The folder is allowed, and the operating system will not let the backend process read or write
 * this entry (`EACCES`, `EPERM`, `EROFS`).
 *
 * `422` and not `403`, for the reason `WORKSPACE_DIRECTORY_UNREADABLE` gives: the caller's
 * authorisation already passed — it is the filesystem that makes the request impossible, and
 * another token would not change that (decided by the user on 2026-09-30, following the
 * precedent of plan 06).
 */
export class FileAccessDeniedError extends DomainError {
  readonly code = 'FILE_ACCESS_DENIED';
  readonly messageKey = 'files.error.accessDenied';

  constructor(path: string, reason: AccessDeniedReason) {
    super(`the operating system refused ${path}: ${reason}`, { path, reason });
  }
}
