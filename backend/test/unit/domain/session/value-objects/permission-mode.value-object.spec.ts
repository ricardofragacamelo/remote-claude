import { describe, expect, it } from 'vitest';

import { isPermissionMode, PERMISSION_MODES } from '@domain/session';

describe('the permission modes', () => {
  it('names the four the contract and the SDK both name', () => {
    expect([...PERMISSION_MODES]).toEqual(['default', 'acceptEdits', 'bypassPermissions', 'plan']);
  });

  it.each(PERMISSION_MODES)('recognises %s', (mode) => {
    expect(isPermissionMode(mode)).toBe(true);
  });

  it.each(['yolo', '', 'DEFAULT', 'accept_edits'])('does not recognise %s', (value) => {
    expect(isPermissionMode(value)).toBe(false);
  });

  it('lists `bypassPermissions` without honouring it', () => {
    // It is in the list because the SDK has it and a client may ask for it. Whether it is obeyed
    // is the options factory's business, and there `allowDangerouslySkipPermissions` stays false —
    // so asking for it does not turn the approval off.
    expect(isPermissionMode('bypassPermissions')).toBe(true);
  });
});
