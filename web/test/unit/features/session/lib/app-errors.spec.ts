import { describe, expect, it } from 'vitest';

import { asAppError } from '@/features/session/lib/app-errors';
import { AppError } from '@/shared/api/errors';

describe('asAppError', () => {
  it('keeps an AppError as it came, and makes anything else the unexpected', () => {
    const known = new AppError('PAYLOAD_TOO_LARGE', 'session.error.attachmentTooLarge', 't');

    expect(asAppError(known, 'x')).toBe(known);
    expect(asAppError(new Error('boom'), 'trace-1')).toMatchObject({
      code: 'INTERNAL_ERROR',
      messageKey: 'common.error.unexpected',
      traceId: 'trace-1',
    });
  });
});
