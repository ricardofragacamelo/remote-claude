import { DomainError } from '@domain/shared';

/**
 * A reference of a prompt names a file that is a folder, or a folder that is a file.
 *
 * `INVALID_INPUT`, and the whole prompt is refused: guessing which was meant is how Claude ends up
 * reading something the person did not choose (plan 08, B-44, S-201).
 */
export class ReferenceKindMismatchError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'session.error.referenceKind';

  /** @param kind what the prompt said it is */
  constructor(path: string, kind: 'file' | 'folder') {
    super(`${path} is not a ${kind}`, { path, kind });
  }
}
