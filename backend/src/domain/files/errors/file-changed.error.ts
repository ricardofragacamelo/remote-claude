import { DomainError } from '@domain/shared';

/**
 * The version the client meant is not the one on disk — `412`.
 *
 * The answer to "Claude wrote this file after you opened it": the save is refused and the disk
 * keeps Claude's version, which is the whole point of `If-Match`. A file that is **gone** answers
 * this too, never a silent re-creation (RFC 9110: without a current representation, `If-Match`
 * fails). It carries the current `ETag`, `null` when nothing is there, so the client can offer to
 * compare ([07 · D-03](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
 *
 * A recursive delete whose count changed between the confirmation and the deletion is the same
 * answer: the folder is no longer the one the person agreed to remove.
 */
export class FileChangedError extends DomainError {
  readonly code = 'FILE_CHANGED';
  readonly messageKey = 'files.error.changed';

  constructor(path: string, currentEtag: string | null) {
    super(`${path} is not the version the request was made against`, { path, currentEtag });
  }
}
