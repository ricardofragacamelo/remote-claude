import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudePluginManifestReader } from '@adapter/outbound/engines/claude/plugin-manifest.reader';

describe('ClaudePluginManifestReader — plan 13, B-27', () => {
  let root: string;
  let reader: ClaudePluginManifestReader;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'rc-plugin-manifest-'));
    reader = new ClaudePluginManifestReader();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeManifest(content: unknown): void {
    const dir = path.join(root, '.claude-plugin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(content), 'utf8');
  }

  it('answers notFound when there is no manifest at all', async () => {
    expect(await reader.read(root)).toBe('notFound');
  });

  it('answers malformed when the manifest is not valid JSON', async () => {
    mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), '{not json', 'utf8');
    expect(await reader.read(root)).toBe('malformed');
  });

  it('answers malformed when the manifest has no name', async () => {
    writeManifest({ description: 'no name here' });
    expect(await reader.read(root)).toBe('malformed');
  });

  it('answers malformed when the manifest is not an object', async () => {
    writeManifest(['nope']);
    expect(await reader.read(root)).toBe('malformed');
  });

  it('reads a minimal manifest with nothing else declared', async () => {
    writeManifest({ name: 'my-plugin' });

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');

    expect(result.manifest).toEqual({
      name: 'my-plugin',
      description: null,
      version: null,
      commands: [],
      agents: [],
      hookCount: 0,
      skills: [],
      mcpServers: [],
    });
    expect(result.digest).toHaveLength(64);
  });

  it('reads commands, agents, hooks, skills and MCP servers together', async () => {
    writeManifest({ name: 'my-plugin', description: 'does things', version: '1.0.0' });

    mkdirSync(path.join(root, 'commands'), { recursive: true });
    writeFileSync(path.join(root, 'commands', 'deploy.md'), '# deploy', 'utf8');
    writeFileSync(path.join(root, 'commands', 'rollback.md'), '# rollback', 'utf8');
    writeFileSync(path.join(root, 'commands', 'ignored.txt'), 'nope', 'utf8');

    mkdirSync(path.join(root, 'agents'), { recursive: true });
    writeFileSync(path.join(root, 'agents', 'reviewer.md'), '# reviewer', 'utf8');

    mkdirSync(path.join(root, 'hooks'), { recursive: true });
    writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
      }),
      'utf8',
    );

    mkdirSync(path.join(root, 'skills', 'explain'), { recursive: true });
    writeFileSync(path.join(root, 'skills', 'explain', 'SKILL.md'), '# explain', 'utf8');
    mkdirSync(path.join(root, 'skills', 'not-a-skill'), { recursive: true });

    writeFileSync(
      path.join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { docs: { command: 'npx', args: ['-y', 'server'] } } }),
      'utf8',
    );

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');

    expect(result.manifest).toEqual({
      name: 'my-plugin',
      description: 'does things',
      version: '1.0.0',
      commands: ['deploy', 'rollback'],
      agents: ['reviewer'],
      hookCount: 1,
      skills: ['explain'],
      mcpServers: [
        {
          name: 'docs',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'server'],
          url: null,
          env: [],
          headers: [],
        },
      ],
    });
  });

  it('reads MCP servers from the manifest’s own inline field, when there is no .mcp.json', async () => {
    writeManifest({
      name: 'my-plugin',
      mcpServers: { docs: { command: 'npx' } },
    });

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');

    expect(result.manifest.mcpServers).toEqual([
      {
        name: 'docs',
        transport: 'stdio',
        command: 'npx',
        args: [],
        url: null,
        env: [],
        headers: [],
      },
    ]);
  });

  it('counts a hooks.json that exists but does not parse as a shape it understands as one opaque hook', async () => {
    writeManifest({ name: 'my-plugin' });
    mkdirSync(path.join(root, 'hooks'), { recursive: true });
    writeFileSync(path.join(root, 'hooks', 'hooks.json'), '[]', 'utf8');

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.hookCount).toBe(1);
  });

  it('refuses a manifest above the size limit', async () => {
    const dir = path.join(root, '.claude-plugin');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'plugin.json'),
      JSON.stringify({ name: 'x'.repeat(70_000) }),
      'utf8',
    );

    expect(await reader.read(root)).toBe('malformed');
  });

  it('answers malformed when the manifest file is a symlink escaping the plugin directory', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'rc-plugin-outside-'));
    writeFileSync(path.join(outside, 'plugin.json'), JSON.stringify({ name: 'escapee' }), 'utf8');
    mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    symlinkSync(
      path.join(outside, 'plugin.json'),
      path.join(root, '.claude-plugin', 'plugin.json'),
    );

    try {
      expect(await reader.read(root)).toBe('malformed');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('skips a plain file sitting inside skills/, and sorts more than one skill by name', async () => {
    writeManifest({ name: 'my-plugin' });
    mkdirSync(path.join(root, 'skills', 'zebra'), { recursive: true });
    writeFileSync(path.join(root, 'skills', 'zebra', 'SKILL.md'), '# zebra', 'utf8');
    mkdirSync(path.join(root, 'skills', 'ant'), { recursive: true });
    writeFileSync(path.join(root, 'skills', 'ant', 'SKILL.md'), '# ant', 'utf8');
    writeFileSync(path.join(root, 'skills', 'not-a-dir.txt'), 'nope', 'utf8');

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.skills).toEqual(['ant', 'zebra']);
  });

  it('reads hooks.json wrapped under a top-level "hooks" key', async () => {
    writeManifest({ name: 'my-plugin' });
    mkdirSync(path.join(root, 'hooks'), { recursive: true });
    writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash' }], PostToolUse: 'not-an-array' } }),
      'utf8',
    );

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.hookCount).toBe(1);
  });

  it('falls back to one opaque hook when a parsed hooks.json has no array of entries at all', async () => {
    writeManifest({ name: 'my-plugin' });
    mkdirSync(path.join(root, 'hooks'), { recursive: true });
    writeFileSync(
      path.join(root, 'hooks', 'hooks.json'),
      JSON.stringify({ note: 'nothing here' }),
      'utf8',
    );

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.hookCount).toBe(1);
  });

  it('reads no MCP servers when the sibling .mcp.json cannot be read', async () => {
    writeManifest({ name: 'my-plugin' });
    writeFileSync(path.join(root, '.mcp.json'), 'x'.repeat(70_000), 'utf8');

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.mcpServers).toEqual([]);
  });

  it('reads no MCP servers when the sibling .mcp.json parses but has no usable mcpServers map', async () => {
    writeManifest({ name: 'my-plugin' });
    writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ somethingElse: true }), 'utf8');

    const result = await reader.read(root);
    if (typeof result === 'string') throw new Error('expected a manifest');
    expect(result.manifest.mcpServers).toEqual([]);
  });
});
