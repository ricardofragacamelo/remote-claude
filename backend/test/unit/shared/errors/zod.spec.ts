import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ZodError } from 'zod';

import { toValidationError } from '@shared/errors/zod';

/** The failure of a parse the test expects to fail. */
function failureOf(value: unknown): ZodError {
  const result = schema.safeParse(value);

  if (result.success) {
    throw new Error('the fixture was supposed to be invalid');
  }

  return result.error;
}

const schema = z.object({
  nonce: z.string().min(1),
  sessionId: z.string(),
  nested: z.object({ depth: z.number() }),
});

describe('toValidationError', () => {
  it('reports every invalid field, not just the first', () => {
    const error = toValidationError(failureOf({}));

    expect(error.details.map((detail) => detail.field).sort()).toEqual([
      'nested',
      'nonce',
      'sessionId',
    ]);
  });

  it('names a nested field by its path', () => {
    const error = toValidationError(
      failureOf({ nonce: 'n', sessionId: 's', nested: { depth: 'no' } }),
    );

    expect(error.details[0]?.field).toBe('nested.depth');
  });

  it('is INVALID_INPUT, which is HTTP 400', () => {
    expect(toValidationError(failureOf({})).code).toBe('INVALID_INPUT');
  });
});
