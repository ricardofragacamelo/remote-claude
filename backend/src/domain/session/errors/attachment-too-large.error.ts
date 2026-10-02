import { DomainError } from '@domain/shared';

/**
 * An upload past the ceiling of an attachment — `413`, and nothing of it is kept.
 *
 * Its own class because the prompt's is a frame of the socket and this is a body of HTTP: the
 * ceiling is the attachment's, said in `params.limit`, so the screen can name it (plan 08, D-02).
 */
export class AttachmentTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly messageKey = 'session.error.attachmentTooLarge';

  constructor(limit: number) {
    super(`attachments are at most ${String(limit)} bytes`, { limit });
  }
}
