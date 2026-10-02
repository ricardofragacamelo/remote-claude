import { DomainError } from '@domain/shared';

/**
 * A prompt names an uploaded attachment this session does not hold: an id it never answered, one
 * of another session, or one whose time ran out.
 *
 * The three answer alike on purpose: telling them apart would say that an id exists somewhere.
 * `404`, and the composer keeps the text so the attachment can be sent again (plan 08, B-04).
 */
export class AttachmentNotFoundError extends DomainError {
  readonly code = 'ATTACHMENT_NOT_FOUND';
  readonly messageKey = 'session.error.attachmentNotFound';

  constructor(attachmentId: string) {
    super(`no attachment ${attachmentId} in this session`, { attachmentId });
  }
}
