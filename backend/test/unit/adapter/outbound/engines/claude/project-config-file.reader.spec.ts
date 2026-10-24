import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ClaudeProjectConfigFileReader } from '@adapter/outbound/engines/claude/project-config-file.reader';
import type { ProjectConfigReadRequest } from '@application/engines/claude';

/**
 * Against a real filesystem — `.claude/` discovery, frontmatter parsing, symlink containment and
 * mtime-based caching are exactly the kind of thing a mock cannot stand in for honestly.
 */
describe('ClaudeProjectConfigFileReader — plan 13, B-31…B-33, B-36…B-38', () => {
  let root: string;
  let home: string;
  let reader: ClaudeProjectConfigFileReader;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'rc-project-config-'));
    home = mkdtempSync(path.join(tmpdir(), 'rc-project-config-home-'));
    reader = new ClaudeProjectConfigFileReader();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function dir(...segments: string[]): string {
    const full = path.join(root, ...segments);
    mkdirSync(full, { recursive: true });
    return full;
  }

  function write(relativePath: string, content: string): void {
    const full = path.join(root, relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  function requestOf(overrides: Partial<ProjectConfigReadRequest> = {}): ProjectConfigReadRequest {
    return {
      folderPath: root,
      allowlistRoot: root,
      memoryFilePaths: [path.join(root, 'CLAUDE.md')],
      homeConfigDir: home,
      ...overrides,
    };
  }

  describe('settings.json — hooks, permissions, plugins (S-141, S-179…S-181)', () => {
    it('reads hooks, flattened to one row per command', async () => {
      write(
        '.claude/settings.json',
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [
                  { type: 'command', command: 'echo one' },
                  { type: 'command', command: 'echo two' },
                ],
              },
              { hooks: [{ type: 'command', command: 'echo three' }] },
            ],
          },
        }),
      );

      const read = await reader.read(requestOf());

      expect(read.hooks).toEqual([
        { event: 'PreToolUse', matcher: 'Bash', command: 'echo one' },
        { event: 'PreToolUse', matcher: 'Bash', command: 'echo two' },
        { event: 'PreToolUse', matcher: null, command: 'echo three' },
      ]);
    });

    it('drops a hooks entry whose event value is not an array, an entry that is not an object, a hooks field that is not an array, and a hook with no string command', async () => {
      write(
        '.claude/settings.json',
        JSON.stringify({
          hooks: {
            NotAnArray: 'oops',
            PreToolUse: [
              'not-an-object',
              { matcher: 'Bash', hooks: 'not-an-array' },
              { matcher: 'Write', hooks: ['not-an-object', { command: 42 }, { type: 'command' }] },
            ],
          },
        }),
      );

      const read = await reader.read(requestOf());

      expect(read.hooks).toEqual([]);
    });

    it('reads permissions, deny and allow, defaulting an absent list to empty', async () => {
      write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['Bash(rm -rf /)'] } }));

      const read = await reader.read(requestOf());

      expect(read.permissions).toEqual({ allow: [], deny: ['Bash(rm -rf /)'] });
    });

    it('reads enabledPlugins, split by whether each is true, and enableAllProjectMcpServers', async () => {
      write(
        '.claude/settings.json',
        JSON.stringify({
          enabledPlugins: { 'reviewer@team': true, 'off-one@team': false },
          enableAllProjectMcpServers: true,
        }),
      );

      const read = await reader.read(requestOf());

      expect(read.plugins).toEqual({
        enabled: ['reviewer@team'],
        disabled: ['off-one@team'],
        enableAllProjectMcpServers: true,
      });
    });

    it('is all empty, with no issue, when there is no settings.json at all', async () => {
      dir('.claude');
      const read = await reader.read(requestOf());

      expect(read.hooks).toEqual([]);
      expect(read.permissions).toEqual({ allow: [], deny: [] });
      expect(read.plugins).toEqual({
        enabled: [],
        disabled: [],
        enableAllProjectMcpServers: false,
      });
      expect(read.issues).toEqual([]);
    });

    it('reports a malformed settings.json as an issue, without failing the rest of the read (S-143)', async () => {
      write('.claude/settings.json', '{ not json');
      write('.claude/commands/review.md', '---\ndescription: review a PR\n---\nBody');

      const read = await reader.read(requestOf());

      expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
      expect(read.commandFiles).toEqual([
        { name: 'review', relativePath: '.claude/commands/review.md' },
      ]);
    });

    it('reports a settings.json above the size cap as tooLarge, never reading it', async () => {
      write(
        '.claude/settings.json',
        JSON.stringify({ permissions: { deny: ['x'.repeat(70_000)] } }),
      );

      const read = await reader.read(requestOf());

      expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'tooLarge' }]);
      expect(read.permissions).toEqual({ allow: [], deny: [] });
    });

    it('reports a settings.json that parses to valid JSON but not an object as malformed', async () => {
      write('.claude/settings.json', JSON.stringify(['not', 'an', 'object']));

      const read = await reader.read(requestOf());

      expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
      expect(read.hooks).toEqual([]);
    });

    it('reports a settings.json that cannot be read after passing every check as malformed', async () => {
      const file = path.join(root, '.claude', 'settings.json');
      write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['x'] } }));
      chmodSync(file, 0o000);

      try {
        const read = await reader.read(requestOf());
        expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
      } finally {
        chmodSync(file, 0o644);
      }
    });

    it('reports a settings.json that is a dangling symlink (its target does not exist) as malformed', async () => {
      dir('.claude');
      symlinkSync(path.join(root, 'nowhere.json'), path.join(root, '.claude', 'settings.json'));

      const read = await reader.read(requestOf());

      expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'malformed' }]);
    });

    it('reports a settings.json that is a symlink escaping the root as linkEscapesRoot (S-144)', async () => {
      const outside = mkdtempSync(path.join(tmpdir(), 'rc-project-config-outside-'));
      writeFileSync(path.join(outside, 'settings.json'), '{}', 'utf8');
      dir('.claude');
      symlinkSync(path.join(outside, 'settings.json'), path.join(root, '.claude', 'settings.json'));

      const read = await reader.read(requestOf());

      expect(read.issues).toEqual([{ path: '.claude/settings.json', reason: 'linkEscapesRoot' }]);
      rmSync(outside, { recursive: true, force: true });
    });

    it('never reads a half-written file — Claude writes settings.json by rename, so a read sees the whole of the old content or the whole of the new one (S-146)', async () => {
      write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['before'] } }));

      // The write a real session does: a sibling temp file, written whole, then `rename`d over the
      // target — the one pattern that makes "before or after, never half" true at the OS level.
      const temp = path.join(root, '.claude', 'settings.json.tmp');
      writeFileSync(temp, JSON.stringify({ permissions: { deny: ['after'] } }), 'utf8');

      const beforeRead = await reader.read(requestOf());
      renameSync(temp, path.join(root, '.claude', 'settings.json'));
      // Deterministic instead of depending on real clock resolution between two fast writes.
      const future = new Date(Date.now() + 60_000);
      utimesSync(path.join(root, '.claude', 'settings.json'), future, future);
      const afterRead = await reader.read(requestOf());

      expect(beforeRead.permissions.deny).toEqual(['before']);
      expect(afterRead.permissions.deny).toEqual(['after']);
      // Never a mix of the two, and never a parse failure from a file caught mid-write.
      expect(beforeRead.issues).toEqual([]);
      expect(afterRead.issues).toEqual([]);
    });
  });

  describe('commands — recursive, namespaced by subdirectory (S-151)', () => {
    it('lists a top-level command by its file name', async () => {
      write('.claude/commands/deploy.md', '---\ndescription: deploy\n---\n');
      const read = await reader.read(requestOf());
      expect(read.commandFiles).toEqual([
        { name: 'deploy', relativePath: '.claude/commands/deploy.md' },
      ]);
    });

    it('namespaces a nested command with the subdirectory, joined with a colon', async () => {
      write('.claude/commands/git/commit.md', '---\ndescription: commit\n---\n');
      const read = await reader.read(requestOf());
      expect(read.commandFiles).toEqual([
        { name: 'git:commit', relativePath: '.claude/commands/git/commit.md' },
      ]);
    });

    it('is empty with no commands directory at all', async () => {
      const read = await reader.read(requestOf());
      expect(read.commandFiles).toEqual([]);
    });

    it('ignores a file that is not a .md file, at any level', async () => {
      write('.claude/commands/deploy.md', '---\ndescription: deploy\n---\n');
      write('.claude/commands/README.txt', 'not a command');
      write('.claude/commands/git/README.txt', 'not a command either');

      const read = await reader.read(requestOf());

      expect(read.commandFiles).toEqual([
        { name: 'deploy', relativePath: '.claude/commands/deploy.md' },
      ]);
    });
  });

  describe('agents — frontmatter risks (S-175, S-176)', () => {
    it('reads a plain agent with no risky frontmatter field', async () => {
      write('.claude/agents/explorer.md', '---\ndescription: reads code\n---\n');
      const read = await reader.read(requestOf());
      expect(read.agentFiles).toEqual([
        {
          name: 'explorer',
          relativePath: '.claude/agents/explorer.md',
          permissionMode: undefined,
          tools: undefined,
          mcpServers: undefined,
        },
      ]);
    });

    it('carries permissionMode, tools and mcpServers straight off the frontmatter, unparsed further', async () => {
      write(
        '.claude/agents/writer.md',
        '---\npermissionMode: acceptEdits\ntools: "*"\nmcpServers:\n  fs: {}\n---\n',
      );
      const read = await reader.read(requestOf());
      expect(read.agentFiles).toEqual([
        {
          name: 'writer',
          relativePath: '.claude/agents/writer.md',
          permissionMode: 'acceptEdits',
          tools: '*',
          mcpServers: { fs: {} },
        },
      ]);
    });

    it('reads an agent with no frontmatter block at all as having none of the fields', async () => {
      write('.claude/agents/plain.md', 'Just a body, no frontmatter.');
      const read = await reader.read(requestOf());
      expect(read.agentFiles).toEqual([
        {
          name: 'plain',
          relativePath: '.claude/agents/plain.md',
          permissionMode: undefined,
          tools: undefined,
          mcpServers: undefined,
        },
      ]);
    });

    it('reads an agent file that cannot be read back as having none of the fields, rather than failing the whole sweep', async () => {
      write('.claude/agents/locked.md', '---\npermissionMode: acceptEdits\n---\n');
      const file = path.join(root, '.claude', 'agents', 'locked.md');
      chmodSync(file, 0o000);

      try {
        const read = await reader.read(requestOf());
        expect(read.agentFiles).toEqual([
          {
            name: 'locked',
            relativePath: '.claude/agents/locked.md',
            permissionMode: undefined,
            tools: undefined,
            mcpServers: undefined,
          },
        ]);
      } finally {
        chmodSync(file, 0o644);
      }
    });
  });

  describe('output styles (S-177)', () => {
    it('lists a project output style file by its name', async () => {
      write('.claude/output-styles/concise.md', '---\ndescription: short answers\n---\n');
      const read = await reader.read(requestOf());
      expect(read.outputStyleFiles).toEqual([
        { name: 'concise', relativePath: '.claude/output-styles/concise.md' },
      ]);
    });

    it('lists more than one output style file, sorted by name', async () => {
      write('.claude/output-styles/zebra.md', '---\ndescription: z\n---\n');
      write('.claude/output-styles/alpha.md', '---\ndescription: a\n---\n');

      const read = await reader.read(requestOf());

      expect(read.outputStyleFiles).toEqual([
        { name: 'alpha', relativePath: '.claude/output-styles/alpha.md' },
        { name: 'zebra', relativePath: '.claude/output-styles/zebra.md' },
      ]);
    });
  });

  describe('memory files (S-148, S-149)', () => {
    it('reports a memory file that exists, with its size and modified time', async () => {
      write('CLAUDE.md', 'remember this');
      const read = await reader.read(requestOf());
      const stat = read.memoryFiles[path.join(root, 'CLAUDE.md')];
      expect(stat?.exists).toBe(true);
      expect(stat?.sizeBytes).toBe('remember this'.length);
      expect(typeof stat?.modifiedAt).toBe('string');
    });

    it('reports a memory file that does not exist as absent', async () => {
      const read = await reader.read(requestOf());
      expect(read.memoryFiles[path.join(root, 'CLAUDE.md')]).toEqual({
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
      });
    });

    it('reports the user’s own memory file, under the home config dir, not the project root', async () => {
      writeFileSync(path.join(home, 'CLAUDE.md'), 'mine', 'utf8');
      const homeMemoryPath = path.join(home, 'CLAUDE.md');
      const read = await reader.read(requestOf({ memoryFilePaths: [homeMemoryPath] }));
      expect(read.memoryFiles[homeMemoryPath]?.exists).toBe(true);
    });

    it('treats a memory file symlinked outside both roots as absent (S-144)', async () => {
      const outside = mkdtempSync(path.join(tmpdir(), 'rc-project-config-outside-'));
      writeFileSync(path.join(outside, 'CLAUDE.md'), 'secret', 'utf8');
      symlinkSync(path.join(outside, 'CLAUDE.md'), path.join(root, 'CLAUDE.md'));

      const read = await reader.read(requestOf());

      expect(read.memoryFiles[path.join(root, 'CLAUDE.md')]).toEqual({
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
      });
      rmSync(outside, { recursive: true, force: true });
    });

    it('treats a dangling memory-file symlink (its target does not exist) as absent', async () => {
      symlinkSync(path.join(root, 'nowhere.md'), path.join(root, 'CLAUDE.md'));

      const read = await reader.read(requestOf());

      expect(read.memoryFiles[path.join(root, 'CLAUDE.md')]).toEqual({
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
      });
    });

    it('treats a directory at the memory-file path as absent — only a regular file counts', async () => {
      dir('CLAUDE.md');

      const read = await reader.read(requestOf());

      expect(read.memoryFiles[path.join(root, 'CLAUDE.md')]).toEqual({
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
      });
    });
  });

  describe('caching — per folder, invalidated by the mtime of every site under .claude/ (S-147)', () => {
    it('reuses the parsed settings/commands/agents on an unchanged second read', async () => {
      write('.claude/commands/first.md', '---\ndescription: one\n---\n');

      const first = await reader.read(requestOf());
      const second = await reader.read(requestOf());

      expect(second.commandFiles).toEqual(first.commandFiles);
    });

    it('sees a new command once it lands in .claude/commands/, even though that never touches .claude/’s own mtime', async () => {
      write('.claude/commands/first.md', '---\ndescription: one\n---\n');
      const first = await reader.read(requestOf());
      expect(first.commandFiles).toHaveLength(1);

      // Deterministic instead of depending on real clock resolution between two fast writes: this
      // is exactly the mtime a real second `write()` a moment later would also produce, just not
      // racing the test runner's own clock for it.
      const future = new Date(Date.now() + 60_000);
      write('.claude/commands/second.md', '---\ndescription: two\n---\n');
      utimesSync(path.join(root, '.claude', 'commands'), future, future);

      const second = await reader.read(requestOf());
      expect(second.commandFiles).toHaveLength(2);
    });

    it('sees a settings.json rewritten in place, even though a directory’s own mtime would not move', async () => {
      write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['one'] } }));
      const first = await reader.read(requestOf());
      expect(first.permissions.deny).toEqual(['one']);

      // Deterministic instead of depending on real clock resolution between two fast writes.
      const future = new Date(Date.now() + 60_000);
      write('.claude/settings.json', JSON.stringify({ permissions: { deny: ['two'] } }));
      utimesSync(path.join(root, '.claude', 'settings.json'), future, future);

      const second = await reader.read(requestOf());
      expect(second.permissions.deny).toEqual(['two']);
    });

    it('always re-stats the memory files, even on a cache hit for the rest (S-147)', async () => {
      await reader.read(requestOf());
      write('CLAUDE.md', 'now it exists');

      const read = await reader.read(requestOf());
      expect(read.memoryFiles[path.join(root, 'CLAUDE.md')]?.exists).toBe(true);
    });
  });
});
