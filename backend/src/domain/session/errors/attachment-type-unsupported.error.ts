import { DomainError } from '@domain/shared';

/**
 * An upload of a kind the prompt does not carry: an image the model does not read, or a binary.
 *
 * `415` — the content is the problem, not its size, which is `PAYLOAD_TOO_LARGE`. The type is said
 * so the screen can name what it does take (plan 08, D-02).
 */
export class AttachmentTypeUnsupportedError extends DomainError {
  readonly code = 'ATTACHMENT_TYPE_UNSUPPORTED';
  readonly messageKey = 'session.error.attachmentTypeUnsupported';

  constructor(mediaType: string) {
    super(`attachments of type ${mediaType} are not accepted`, { mediaType });
  }
}
