import { describe, expect, it } from 'vitest';

import {
  claudeSettingsHref,
  CLAUDE_SETTINGS_SECTIONS,
  isClaudeSettingsSection,
  readClaudeSettingsSearch,
} from '@/features/claude-settings';

describe('the address of Claude settings — plan 13, B-09', () => {
  it('reads the section and the folder the link names', () => {
    expect(readClaudeSettingsSearch({ section: 'mcp', folder: '/srv/app' })).toEqual({
      section: 'mcp',
      folder: '/srv/app',
    });
  });

  it('lands a section nobody knows on the first one, and drops a folder that is not absolute', () => {
    expect(readClaudeSettingsSearch({ section: 'secrets', folder: 'relative/path' })).toEqual({
      section: 'account',
    });
    expect(readClaudeSettingsSearch({})).toEqual({ section: 'account' });
    expect(readClaudeSettingsSearch({ section: 'skills', folder: '/srv/\0x' })).toEqual({
      section: 'skills',
    });
    expect(readClaudeSettingsSearch({ section: 42 })).toEqual({ section: 'account' });
  });

  it('builds the link back, folder and all — S-15', () => {
    expect(claudeSettingsHref({ section: 'project', folder: '/srv/a b' })).toBe(
      '/claude-settings?section=project&folder=%2Fsrv%2Fa+b',
    );
    expect(claudeSettingsHref({ section: 'account' })).toBe('/claude-settings?section=account');
  });

  it('knows the seven sections, in order', () => {
    expect(CLAUDE_SETTINGS_SECTIONS).toEqual([
      'account',
      'installation',
      'models',
      'mcp',
      'plugins',
      'skills',
      'project',
    ]);
    expect(isClaudeSettingsSection('plugins')).toBe(true);
    expect(isClaudeSettingsSection('settings')).toBe(false);
  });
});
