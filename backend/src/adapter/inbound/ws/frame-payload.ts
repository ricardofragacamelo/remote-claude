import type { Envelope } from '@remote-claude/contracts';
import type { ZodType } from 'zod';

import { toValidationError } from '@shared/errors/zod';

/**
 * The payload of a command frame, validated against the schema of that command.
 *
 * Every handler needs exactly this, and two copies of a validation guard is the duplication that
 * matters most here: one gets fixed, the other keeps letting things through.
 *
 * @throws {import('@shared/errors/input-validation.error').InputValidationError} listing every
 *   invalid field, never only the first
 */
export function payloadOf<T>(frame: Envelope, schema: ZodType<T>): T {
  const parsed = schema.safeParse(frame.payload ?? {});

  if (!parsed.success) {
    throw toValidationError(parsed.error);
  }

  return parsed.data;
}
