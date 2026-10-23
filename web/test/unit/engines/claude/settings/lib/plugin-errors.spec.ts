import { describe, expect, it } from 'vitest';

import { AppError } from '@/shared/api/errors';
import { pluginErrorOf } from '@/engines/claude/settings/lib/plugin-errors';

describe('pluginErrorOf', () => {
  it('passes an AppError through unchanged', () => {
    const error = new AppError('FORBIDDEN', 'common.error.forbidden', 't1');
    expect(pluginErrorOf(error)).toBe(error);
  });

  it('turns anything else into the unexpected error, logged', () => {
    const turned = pluginErrorOf(new Error('boom'));
    expect(turned).toBeInstanceOf(AppError);
    expect(turned.code).toBe('INTERNAL_ERROR');
    expect(turned.messageKey).toBe('common.error.unexpected');
  });

  it('turns a rejection that is not even an Error into the unexpected error too', () => {
    const turned = pluginErrorOf('a string rejection');
    expect(turned.code).toBe('INTERNAL_ERROR');
  });
});
