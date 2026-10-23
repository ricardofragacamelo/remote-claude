import { describe, expect, it } from 'vitest';

import { AppError } from '@/shared/api/errors';
import { mcpErrorOf } from '@/features/mcp/lib/mcp-errors';

describe('mcpErrorOf', () => {
  it('passes an AppError through unchanged', () => {
    const error = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    expect(mcpErrorOf(error)).toBe(error);
  });

  it('turns anything else into the unexpected error, logged', () => {
    const turned = mcpErrorOf(new Error('boom'));
    expect(turned).toBeInstanceOf(AppError);
    expect(turned.code).toBe('INTERNAL_ERROR');
    expect(turned.messageKey).toBe('common.error.unexpected');
  });

  it('turns a rejection that is not even an Error into the unexpected error too', () => {
    const turned = mcpErrorOf('a string rejection');
    expect(turned.code).toBe('INTERNAL_ERROR');
  });
});
