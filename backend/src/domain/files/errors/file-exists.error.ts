import { DomainError } from '@domain/shared';

/**
 * Creating, moving or copying onto something that is already there — and nothing was overwritten.
 *
 * It carries the `ETag` of what is there when that is a file this server can hash: it is how a
 * client that never got the answer to its own create recognises the file as the one it sent
 * ([07 · D-03](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
 */
export class FileExistsError extends DomainError {
  readonly code = 'FILE_EXISTS';
  readonly messageKey = 'files.error.exists';

  /**
   * @param path relative to the open folder
   * @param currentEtag the `ETag` of the file already there, or `null` for anything else
   */
  constructor(path: string, currentEtag: string | null = null) {
    super(`${path} already exists`, { path, currentEtag });
  }
}
