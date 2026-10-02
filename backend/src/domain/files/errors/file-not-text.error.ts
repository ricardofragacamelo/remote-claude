import { DomainError } from '@domain/shared';

/** Why a file is not text this server will decode. */
export type NotTextReason = 'binary' | 'encoding';

/**
 * Not text — `415`.
 *
 * `binary` is a NUL in the first 8 KB; `encoding` is bytes that are not valid UTF-8 and no
 * encoding was asked for. Never a guess: decoding latin-1 as UTF-8 and saving it back rewrites
 * every accented byte, so the client is told and offers "reopen with encoding"
 * ([07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)).
 */
export class FileNotTextError extends DomainError {
  readonly code = 'FILE_NOT_TEXT';
  readonly messageKey = 'files.error.notText';

  constructor(path: string, reason: NotTextReason) {
    super(`${path} is not text this server decodes: ${reason}`, { path, reason });
  }
}
