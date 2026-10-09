import { describe, expect, it } from 'vitest';

import {
  assertAllowed,
  FLAG_SETTINGS_KEYS,
  flagSettings,
  UnsafeFlagSettingsError,
} from '@adapter/outbound/claude/flag-settings';

describe('flagSettings — plan 13, B-08', () => {
  it('always switches the shell inline off, and adds the output style only when one was chosen', () => {
    expect(flagSettings()).toEqual({ disableSkillShellExecution: true });
    expect(flagSettings({ outputStyle: null })).toEqual({ disableSkillShellExecution: true });
    expect(flagSettings({ outputStyle: 'Concise' })).toEqual({
      disableSkillShellExecution: true,
      outputStyle: 'Concise',
    });
  });

  it('takes outputStyle and disableSkillShellExecution, and nothing else — S-08', () => {
    expect(FLAG_SETTINGS_KEYS).toEqual(['outputStyle', 'disableSkillShellExecution']);
    expect(() => {
      assertAllowed(['outputStyle', 'disableSkillShellExecution']);
    }).not.toThrow();

    for (const key of [
      'permissions',
      'hooks',
      'enabledPlugins',
      'enableAllProjectMcpServers',
      'env',
      'effortLevel',
    ]) {
      expect(() => {
        assertAllowed([key]);
      }).toThrow(UnsafeFlagSettingsError);
    }
  });

  it('refuses an input carrying a key outside the allowlist, naming it', () => {
    expect(() => flagSettings({ permissions: {} } as never)).toThrow(/permissions/);
  });
});
