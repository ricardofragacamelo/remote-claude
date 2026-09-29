import { SetMetadata } from '@nestjs/common';

/** Where a route keeps the fields of its body the I/O log leaves out. */
export const OMITTED_FROM_LOG = Symbol('omittedFromLog');

/**
 * Fields of this route's request body that never reach the I/O log.
 *
 * The redaction list catches what is secret by name — a token, a password. This is for what is not
 * secret by name and still must not be kept: the parameters of a notification, which may carry a
 * path or a folder name, stay out of the log the way they stay out of the push (plan 06, S-178).
 * The field is replaced by the redaction marker, so the line still says it was there.
 */
export const OmitFromLog = (...fields: readonly string[]): MethodDecorator =>
  SetMetadata(OMITTED_FROM_LOG, fields);
