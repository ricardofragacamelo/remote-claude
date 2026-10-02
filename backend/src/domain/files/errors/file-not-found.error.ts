import { DomainError } from '@domain/shared';

/**
 * Nothing at that path inside the open folder.
 *
 * Distinct from `WORKSPACE_NOT_FOUND`, which is the **folder** that is gone: here the folder is
 * there and the entry is not — most often because Claude removed it a moment ago.
 */
export class FileNotFoundError extends DomainError {
  readonly code = 'FILE_NOT_FOUND';
  readonly messageKey = 'files.error.notFound';

  /** @param path relative to the open folder, as the client named it */
  constructor(path: string) {
    super(`${path} does not exist inside the open folder`, { path });
  }
}
