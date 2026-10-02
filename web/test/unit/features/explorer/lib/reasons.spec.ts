import { describe, expect, it } from 'vitest';

import { reasonKeyOf } from '@/features/explorer/lib/reasons';
import { AppError } from '@/shared/api/errors';

const anError = (code: string, params = {}): AppError =>
  new AppError(code, `key.of.${code}`, 't', params);

describe('the sentence a failure is told with', () => {
  it('explains an undo in the words of an undo — S-185', () => {
    expect(reasonKeyOf(anError('FILE_CHANGED'), 'undo')).toBe('explorer.undo.changed');
    expect(reasonKeyOf(anError('FILE_CHANGED'), 'operation')).toBe('key.of.FILE_CHANGED');
    expect(reasonKeyOf(anError('STORAGE_FULL'), 'undo')).toBe('key.of.STORAGE_FULL');
  });

  it('says why an operation is impossible, by its reason — S-176', () => {
    expect(
      reasonKeyOf(anError('FILE_OPERATION_INVALID', { reason: 'intoItself' }), 'operation'),
    ).toBe('explorer.invalid.intoItself');
    expect(reasonKeyOf(anError('FILE_OPERATION_INVALID', { reason: 'other' }), 'operation')).toBe(
      'key.of.FILE_OPERATION_INVALID',
    );
  });
});
