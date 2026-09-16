import { DomainError } from '@domain/shared';

/** A frame or body above the declared limit. Announced in `connection.ready.limits`. */
export class PayloadTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE';
  readonly messageKey = 'common.error.payloadTooLarge';

  constructor(bytes: number, limit: number) {
    super(`payload of ${String(bytes)} bytes is over the ${String(limit)} byte limit`, {
      bytes,
      limit,
    });
  }
}
