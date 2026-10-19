import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudeProjectMcpFileReader } from '@adapter/outbound/engines/claude/project-mcp-file.reader';

/**
 * Against a real filesystem — climbing, `.git` detection and symlink containment are exactly the
 * kind of thing a mock cannot stand in for honestly.
 */
describe('ClaudeProjectMcpFileReader — plan 13, B-24', () => {
  let root: string;
  let reader: ClaudeProjectMcpFileReader;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'rc-project-mcp-'));
    reader = new ClaudeProjectMcpFileReader();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function folder(...segments: string[]): string {
    const full = path.join(root, ...segments);
    mkdirSync(full, { recursive: true });
    return full;
  }

  function writeMcpJson(dir: string, content: unknown): void {
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(content), 'utf8');
  }

  describe('readAt — one folder, on its own', () => {
    it('reads a stdio entry', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, {
        mcpServers: {
          docs: { command: 'npx', args: ['-y', 'server'], env: { TOKEN: '${TOKEN}' } },
        },
      });

      const read = await reader.readAt(dir);

      expect(read).toEqual({
        folderPath: dir,
        error: null,
        entries: [
          {
            name: 'docs',
            transport: 'stdio',
            command: 'npx',
            args: ['-y', 'server'],
            url: null,
            env: [{ name: 'TOKEN', value: '${TOKEN}' }],
            headers: [],
          },
        ],
      });
    });

    it('reads a remote entry, http or sse, by its declared type', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, {
        mcpServers: {
          figma: {
            type: 'sse',
            url: 'https://mcp.example.com/figma',
            headers: { Authorization: 'Bearer ${TOKEN}' },
          },
        },
      });

      const read = await reader.readAt(dir);

      expect(read?.entries).toEqual([
        {
          name: 'figma',
          transport: 'sse',
          command: null,
          args: [],
          url: 'https://mcp.example.com/figma',
          env: [],
          headers: [{ name: 'Authorization', value: 'Bearer ${TOKEN}' }],
        },
      ]);
    });

    it('answers null when there is no file at all', async () => {
      const dir = folder('repo');
      expect(await reader.readAt(dir)).toBeNull();
    });

    it('explains a file larger than the cap, without reading its content — S-106', async () => {
      const dir = folder('repo');
      writeFileSync(path.join(dir, '.mcp.json'), 'x'.repeat(70_000), 'utf8');

      expect(await reader.readAt(dir)).toEqual({ folderPath: dir, entries: [], error: 'tooLarge' });
    });

    it('explains invalid JSON — S-106', async () => {
      const dir = folder('repo');
      writeFileSync(path.join(dir, '.mcp.json'), '{not json', 'utf8');

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('explains a stdio shape it does not recognise, the whole file at once — S-106', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, { mcpServers: { docs: { args: ['no command here'] } } });

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('explains a remote shape missing a url, or with headers of the wrong shape — S-106', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, { mcpServers: { figma: { type: 'sse', headers: {} } } });
      expect((await reader.readAt(dir))?.error).toBe('malformed');

      writeMcpJson(dir, {
        mcpServers: { figma: { type: 'http', url: 'https://x', headers: { a: 1 } } },
      });
      expect((await reader.readAt(dir))?.error).toBe('malformed');
    });

    it('explains a .mcp.json that is a broken link — S-106', async () => {
      const dir = folder('repo');
      symlinkSync(path.join(dir, 'nowhere'), path.join(dir, '.mcp.json'));

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('explains a .mcp.json that is actually a directory — S-106', async () => {
      const dir = folder('repo');
      mkdirSync(path.join(dir, '.mcp.json'));

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('falls back to the given path itself when a folder cannot even be resolved — a race with its own removal', async () => {
      const dir = path.join(root, 'gone');

      expect(await reader.readAt(dir)).toBeNull();
    });

    it('explains a .mcp.json that is a link leading outside its own folder — S-106', async () => {
      const dir = folder('repo');
      const outside = folder('outside');
      writeMcpJson(outside, { mcpServers: {} });
      symlinkSync(path.join(outside, '.mcp.json'), path.join(dir, '.mcp.json'));

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'linkEscapesRoot',
      });
    });
  });

  describe('climb — from a folder up to the first VCS root, or the allowlist root', () => {
    it('finds a file at the folder itself, nearest first, and stops there when it has .git', async () => {
      const dir = folder('repo');
      mkdirSync(path.join(dir, '.git'));
      writeMcpJson(dir, { mcpServers: { docs: { command: 'npx' } } });
      writeMcpJson(folder('.'), { mcpServers: { above: { command: 'should-not-appear' } } });

      const files = await reader.climb({ folder: dir, allowlistRoot: root });

      expect(files).toHaveLength(1);
      expect(files[0]?.folderPath).toBe(dir);
    });

    it('climbs several levels, nearest first, when none of them has .git yet', async () => {
      const deep = folder('repo', 'packages', 'app');
      const mid = folder('repo', 'packages');
      const shallow = folder('repo');
      mkdirSync(path.join(shallow, '.git'));
      writeMcpJson(deep, { mcpServers: { a: { command: 'deep' } } });
      writeMcpJson(mid, { mcpServers: { b: { command: 'mid' } } });
      writeMcpJson(shallow, { mcpServers: { c: { command: 'shallow' } } });

      const files = await reader.climb({ folder: deep, allowlistRoot: root });

      expect(files.map((file) => file.folderPath)).toEqual([deep, mid, shallow]);
    });

    it('stops at the allowlist root even when no .git is ever found', async () => {
      const dir = folder('repo', 'packages', 'app');
      writeMcpJson(dir, { mcpServers: { a: { command: 'x' } } });

      const files = await reader.climb({ folder: dir, allowlistRoot: root });

      expect(files.map((file) => file.folderPath)).toEqual([dir]);
    });

    it('skips a level with no file at all, silently — not an error', async () => {
      const deep = folder('repo', 'packages', 'app');
      const shallow = folder('repo');
      mkdirSync(path.join(shallow, '.git'));
      writeMcpJson(shallow, { mcpServers: { c: { command: 'shallow' } } });

      const files = await reader.climb({ folder: deep, allowlistRoot: root });

      expect(files).toHaveLength(1);
      expect(files[0]?.folderPath).toBe(shallow);
    });

    it('carries a bad file along the climb as its own error, and keeps climbing past it', async () => {
      const deep = folder('repo', 'packages', 'app');
      const shallow = folder('repo');
      mkdirSync(path.join(shallow, '.git'));
      writeFileSync(path.join(deep, '.mcp.json'), '{not json', 'utf8');
      writeMcpJson(shallow, { mcpServers: { c: { command: 'shallow' } } });

      const files = await reader.climb({ folder: deep, allowlistRoot: root });

      expect(files).toEqual([
        { folderPath: deep, entries: [], error: 'malformed' },
        {
          folderPath: shallow,
          entries: [
            {
              name: 'c',
              transport: 'stdio',
              command: 'shallow',
              args: [],
              url: null,
              env: [],
              headers: [],
            },
          ],
          error: null,
        },
      ]);
    });

    it('finds nothing when no folder along the climb ever has the file', async () => {
      const dir = folder('repo');
      mkdirSync(path.join(dir, '.git'));

      expect(await reader.climb({ folder: dir, allowlistRoot: root })).toEqual([]);
    });

    it('stops at the filesystem root itself, the last resort against climbing forever', async () => {
      // Only reachable if an allowlist root were ever misconfigured at or above `/` — the safety
      // net the climb falls back on when even that boundary check could not have stopped it.
      expect(await reader.climb({ folder: '/', allowlistRoot: '/' })).toEqual([]);
    });
  });

  describe('the shape of one entry — every way it can be unrecognisable', () => {
    it('refuses an entry that is not an object at all', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, { mcpServers: { docs: 'not an object' } });

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('refuses a type nobody recognises', async () => {
      const dir = folder('repo');
      writeMcpJson(dir, { mcpServers: { docs: { type: 'websocket', command: 'npx' } } });

      expect(await reader.readAt(dir)).toEqual({
        folderPath: dir,
        entries: [],
        error: 'malformed',
      });
    });

    it('refuses a file whose top level is not an object, or has no mcpServers at all', async () => {
      const dir = folder('repo');
      writeFileSync(path.join(dir, '.mcp.json'), '[]', 'utf8');
      expect((await reader.readAt(dir))?.error).toBe('malformed');

      writeMcpJson(dir, { somethingElse: true });
      expect((await reader.readAt(dir))?.error).toBe('malformed');
    });
  });
});
