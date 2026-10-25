import { describe, expect, it } from 'vitest';

import {
  assertAllowed,
  FLAG_SETTINGS_KEYS,
  flagSettings,
  UnsafeFlagSettingsError,
} from '@adapter/outbound/engines/claude/flag-settings';

describe('flagSettings — plan 13, B-08', () => {
  it('always switches the shell inline off, and adds the output style only when one was chosen', () => {
    expect(flagSettings()).toEqual({ disableSkillShellExecution: true });
    expect(flagSettings({ outputStyle: null })).toEqual({ disableSkillShellExecution: true });
    expect(flagSettings({ outputStyle: 'Concise' })).toEqual({
      disableSkillShellExecution: true,
      outputStyle: 'Concise',
    });
  });

  it('adds auto-compact only when it was said — S-163', () => {
    expect(flagSettings({ autoCompactEnabled: true })).toEqual({
      disableSkillShellExecution: true,
      autoCompactEnabled: true,
    });
    expect(flagSettings({ autoCompactEnabled: true, autoCompactWindow: 50_000 })).toEqual({
      disableSkillShellExecution: true,
      autoCompactEnabled: true,
      autoCompactWindow: 50_000,
    });
    // `0` is the sentinel for "the engine's own" — left out, same as an absent window.
    expect(flagSettings({ autoCompactEnabled: false, autoCompactWindow: 0 })).toEqual({
      disableSkillShellExecution: true,
      autoCompactEnabled: false,
    });
  });

  it('takes outputStyle, disableSkillShellExecution, autoCompactEnabled and autoCompactWindow, and nothing else — S-08', () => {
    expect(FLAG_SETTINGS_KEYS).toEqual([
      'outputStyle',
      'disableSkillShellExecution',
      'autoCompactEnabled',
      'autoCompactWindow',
    ]);
    expect(() => {
      assertAllowed([
        'outputStyle',
        'disableSkillShellExecution',
        'autoCompactEnabled',
        'autoCompactWindow',
      ]);
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
