import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { InputValidationError } from '@shared/errors/input-validation.error';
import { ZodPipe } from '@shared/validation/zod.pipe';

const pipe = new ZodPipe(z.object({ code: z.string().min(1) }));

describe('ZodPipe', () => {
  it('passes a valid body through, parsed', () => {
    expect(pipe.transform({ code: 'abc', extra: 1 })).toEqual({ code: 'abc' });
  });

  it('refuses an invalid body with INVALID_INPUT', () => {
    expect(() => pipe.transform({})).toThrow(InputValidationError);
  });

  it('refuses a body that is not an object at all', () => {
    expect(() => pipe.transform('nope')).toThrow(InputValidationError);
  });
});
