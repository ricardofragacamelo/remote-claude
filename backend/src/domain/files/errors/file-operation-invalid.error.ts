import { DomainError } from '@domain/shared';

/**
 * Why an operation cannot be done, whatever the disk holds.
 *
 * - `intoItself` — a folder moved or copied into itself;
 * - `openFolder` — the open folder itself as the subject: it is the fence, not an entry inside it;
 * - `crossDevice` — the destination is on another filesystem. Never turned into a copy and a
 *   delete behind the person's back ([07 · D-12](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever));
 * - `symlinkLoop` — links that lead back to themselves.
 */
export type OperationInvalidReason = 'intoItself' | 'openFolder' | 'crossDevice' | 'symlinkLoop';

/** `422`: understood, and impossible as asked. */
export class FileOperationInvalidError extends DomainError {
  readonly code = 'FILE_OPERATION_INVALID';
  readonly messageKey = 'files.error.operationInvalid';

  constructor(path: string, reason: OperationInvalidReason) {
    super(`${path}: the operation is impossible as asked (${reason})`, { path, reason });
  }
}
