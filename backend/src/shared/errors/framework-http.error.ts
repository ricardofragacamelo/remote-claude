import { DomainError } from '@domain/shared';

/** Generic codes, for the failures the framework raises before any domain rule runs. */
const BY_STATUS: Readonly<Record<number, { code: string; messageKey: string }>> = {
  400: { code: 'INVALID_INPUT', messageKey: 'common.error.invalidInput' },
  401: { code: 'UNAUTHENTICATED', messageKey: 'auth.error.unauthenticated' },
  403: { code: 'FORBIDDEN', messageKey: 'common.error.forbidden' },
  404: { code: 'NOT_FOUND', messageKey: 'common.error.notFound' },
  413: { code: 'PAYLOAD_TOO_LARGE', messageKey: 'common.error.payloadTooLarge' },
  429: { code: 'RATE_LIMITED', messageKey: 'common.error.rateLimited' },
};

/**
 * What Nest throws, said in our vocabulary.
 *
 * An unknown route or a body the parser could not read never reaches a use case, so no domain
 * error exists for it — and the client still has to receive the one envelope every other failure
 * uses. Anything outside the table is ours to fix, so it reads as `INTERNAL_ERROR`.
 */
export class FrameworkHttpError extends DomainError {
  readonly code: string;
  readonly messageKey: string;

  constructor(status: number) {
    const mapped = BY_STATUS[status] ?? {
      code: 'INTERNAL_ERROR',
      messageKey: 'common.error.unexpected',
    };

    super(`framework raised HTTP ${String(status)}`);
    this.code = mapped.code;
    this.messageKey = mapped.messageKey;
  }
}
