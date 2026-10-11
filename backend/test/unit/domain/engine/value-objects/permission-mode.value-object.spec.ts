import { describe, expect, it } from 'vitest';

import { canonicalPermissionMode, isPermissionMode, PERMISSION_MODES } from '@domain/engine';
import * as session from '@domain/session';

describe('the permission modes — plan 28, B-26', () => {
  it('names the four canonical modes, the same for every engine', () => {
    expect([...PERMISSION_MODES]).toEqual(['ask', 'acceptEdits', 'readOnly', 'allowAll']);
  });

  it.each(PERMISSION_MODES)('recognises %s', (mode) => {
    expect(isPermissionMode(mode)).toBe(true);
  });

  it.each([
    'yolo',
    '',
    'ASK',
    'default',
    'plan',
    'bypassPermissions',
    'accept_edits',
    'allowall',
    'read_only',
  ])('does not recognise %s', (value) => {
    expect(isPermissionMode(value)).toBe(false);
  });

  it('is what a session runs in, re-exported where a session reads it', () => {
    expect(session.PERMISSION_MODES).toBe(PERMISSION_MODES);
    expect(session.canonicalPermissionMode).toBe(canonicalPermissionMode);
    expect(session.isPermissionMode).toBe(isPermissionMode);
  });

  describe('the canonical mode of an old name — S-77', () => {
    it.each([
      ['default', 'ask'],
      ['plan', 'readOnly'],
    ])('reads the old %s as %s', (old, canonical) => {
      expect(canonicalPermissionMode(old)).toBe(canonical);
    });

    it.each(PERMISSION_MODES)('reads the canonical %s as itself', (mode) => {
      expect(canonicalPermissionMode(mode)).toBe(mode);
    });

    it.each(['bypassPermissions', 'yolo', '', 'Default', 'PLAN', 'toString', 'constructor'])(
      'reads %s as no mode at all',
      (value) => {
        // `bypassPermissions` was never honoured, and is not carried over as anything else.
        expect(canonicalPermissionMode(value)).toBeNull();
      },
    );
  });
});
