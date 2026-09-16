import { DomainError } from '@domain/shared';

/**
 * A client speaking a protocol version this server does not.
 *
 * It carries the versions that are supported, because the only useful thing the client can do is
 * tell its user to update. It is the one malformed-frame case that closes the socket (`4426`)
 * instead of answering an error: nothing else on that connection can work.
 */
export class UnsupportedProtocolVersionError extends DomainError {
  readonly code = 'INVALID_INPUT';
  readonly messageKey = 'connection.error.unsupportedVersion';

  constructor(
    received: unknown,
    readonly supportedVersions: readonly number[],
  ) {
    super(`protocol version ${JSON.stringify(received)} is not supported`, {
      supportedVersions,
    });
  }
}
