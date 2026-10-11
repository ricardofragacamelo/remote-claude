import { describe, expect, it } from 'vitest';

import { SensitiveFiles } from '@domain/files';

/** Two engines' configuration, as the composition would put it together. */
const files = SensitiveFiles.of([
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.mcp.json',
  '.codex/config.toml',
]);

describe('the files that change what an agent may do — D-15, plan 28 B-35', () => {
  it('are the files declared, by their path in the open folder', () => {
    expect(files.includes('.claude/settings.json')).toBe(true);
    expect(files.includes('.codex/config.toml')).toBe(true);
    expect(files.includes('sub/.claude/settings.json')).toBe(false);
    expect(files.includes('.claude/agents/x.md')).toBe(false);
  });

  it('are reached by an operation on them, or on a folder that holds one', () => {
    expect(files.touchedBy('.mcp.json')).toBe(true);
    expect(files.touchedBy('.claude')).toBe(true);
    expect(files.touchedBy('.codex')).toBe(true);
    expect(files.touchedBy('.claude/agents')).toBe(false);
    expect(files.touchedBy('src')).toBe(false);
  });

  it('count a file declared twice once, in its first place', () => {
    expect(SensitiveFiles.of(['.mcp.json', '.a/b', '.mcp.json']).files).toEqual([
      '.mcp.json',
      '.a/b',
    ]);
  });

  it('are none when no engine declares any — nothing takes the second step', () => {
    const none = SensitiveFiles.of([]);

    expect(none.files).toEqual([]);
    expect(none.touchedBy('.claude')).toBe(false);
    expect(none.includes('.mcp.json')).toBe(false);
  });
});
