import { describe, expect, it } from 'vitest';

import { sdkPermissionMode } from '@adapter/outbound/engines/claude/claude-permission-mode';
import { PERMISSION_MODES } from '@domain/engine';
import type { PermissionMode } from '@domain/engine';

describe('what the SDK is told for each canonical mode — plan 28, S-77', () => {
  it.each<[PermissionMode, string]>([
    ['ask', 'default'],
    ['acceptEdits', 'acceptEdits'],
    ['readOnly', 'plan'],
    ['allowAll', 'default'],
  ])('tells it %s as %s', (mode, sdk) => {
    expect(sdkPermissionMode(mode)).toBe(sdk);
  });

  it('tells it `default` for Permitir tudo, so `canUseTool` keeps being called — S-06, S-07', () => {
    expect(sdkPermissionMode('allowAll')).toBe('default');
  });

  it('never tells it `bypassPermissions`, whatever the mode', () => {
    expect(PERMISSION_MODES.map(sdkPermissionMode)).not.toContain('bypassPermissions');
  });
});
