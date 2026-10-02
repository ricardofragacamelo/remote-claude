import { DomainError } from '@domain/shared';

/**
 * The text has a character the target encoding cannot represent.
 *
 * Refused rather than written with `?` in its place: a save that silently changes characters is
 * a save that loses work ([07 · D-04](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-04--teto-de-tamanho-e-encoding)).
 */
export class FileNotEncodableError extends DomainError {
  readonly code = 'FILE_NOT_ENCODABLE';
  readonly messageKey = 'files.error.notEncodable';

  constructor(path: string, encoding: string) {
    super(`${path} has characters ${encoding} cannot represent`, { path, encoding });
  }
}
