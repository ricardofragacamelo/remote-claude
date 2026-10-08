import { describe, expect, it } from 'vitest';

import { isPermissionMode, PERMISSION_MODES, sdkPermissionMode } from '@domain/session';

describe('the permission modes', () => {
  it('names the four the SDK names, plus Permitir tudo, which is ours — plan 23, S-05', () => {
    expect([...PERMISSION_MODES]).toEqual([
      'default',
      'acceptEdits',
      'bypassPermissions',
      'plan',
      'allowAll',
    ]);
  });

  it.each(PERMISSION_MODES)('recognises %s', (mode) => {
    expect(isPermissionMode(mode)).toBe(true);
  });

  it.each(['yolo', '', 'DEFAULT', 'accept_edits', 'allowall', 'allow_all'])(
    'does not recognise %s',
    (value) => {
      expect(isPermissionMode(value)).toBe(false);
    },
  );

  it('lists `bypassPermissions` without honouring it', () => {
    // It is in the list because the SDK has it and a client may ask for it. Whether it is obeyed
    // is the options factory's business, and there `allowDangerouslySkipPermissions` stays false —
    // so asking for it does not turn the approval off.
    expect(isPermissionMode('bypassPermissions')).toBe(true);
  });

  describe('what the SDK is told — plan 23, ADR-022', () => {
    it('tells it `default` for Permitir tudo, so `canUseTool` keeps being called — S-06, S-07', () => {
      expect(sdkPermissionMode('allowAll')).toBe('default');
    });

    it.each(['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const)(
      'tells it %s as it is — S-08',
      (mode) => {
        expect(sdkPermissionMode(mode)).toBe(mode);
      },
    );
  });
});
