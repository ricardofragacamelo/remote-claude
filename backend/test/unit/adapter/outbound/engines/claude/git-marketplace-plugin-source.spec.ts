import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitMarketplacePluginSource } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import type { GitCommand } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import { ClaudePluginManifestReader } from '@adapter/outbound/engines/claude/plugin-manifest.reader';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const SOURCE = { type: 'git' as const, url: 'https://example.invalid/acme.git' };

/** What a `git clone` of this fixture's marketplace produces, per commit. */
const MARKETPLACES: Record<
  string,
  { readonly name: string; readonly plugins: readonly unknown[] }
> = {
  [COMMIT_A]: {
    name: 'acme',
    plugins: [
      { name: 'one', description: 'first plugin', source: 'plugins/one' },
      { name: 'two', description: null, source: { kind: 'another-repo' } },
    ],
  },
};

function writePluginFixture(dir: string, name: string, extra: Record<string, unknown> = {}): void {
  mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, ...extra }),
    'utf8',
  );
}

/**
 * A `GitCommand` that never runs `git`: `clone` writes the fixture a test registered for the
 * current "commit" into the destination directory, `rev-parse` answers that commit, and
 * `ls-remote` answers whichever commit `lsRemoteAnswer` currently holds.
 */
function fakeGit(options: {
  commit: string;
  lsRemoteAnswer?: string | null;
  afterClone?: (destination: string) => void;
}): GitCommand {
  return async (args) => {
    if (args[0] === 'clone') {
      const destination = args.at(-1) as string;
      const marketplace = MARKETPLACES[options.commit];
      if (marketplace === undefined) {
        throw new Error('fixture has no marketplace for this commit');
      }
      mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
      writeFileSync(
        path.join(destination, '.claude-plugin', 'marketplace.json'),
        JSON.stringify(marketplace),
        'utf8',
      );
      writePluginFixture(path.join(destination, 'plugins', 'one'), 'one');
      options.afterClone?.(destination);
      return '';
    }
    if (args[0] === 'rev-parse') {
      return `${options.commit}\n`;
    }
    if (args[0] === 'ls-remote') {
      if (options.lsRemoteAnswer === null) {
        throw new Error('no such remote');
      }
      return `${options.lsRemoteAnswer ?? options.commit}\tHEAD\n`;
    }
    throw new Error(`unexpected git command: ${args.join(' ')}`);
  };
}

describe('GitMarketplacePluginSource — plan 13, B-47', () => {
  let baseDir: string;
  let logger: RecordingLogger;
  let manifests: ClaudePluginManifestReader;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'rc-marketplace-base-'));
    logger = new RecordingLogger();
    manifests = new ClaudePluginManifestReader();
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  function sourceOf(git: GitCommand): GitMarketplacePluginSource {
    return new GitMarketplacePluginSource({ baseDir }, manifests, logger.logger, git);
  }

  describe('resolveCommit', () => {
    it('answers the commit ls-remote reports for HEAD', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A, lsRemoteAnswer: COMMIT_B }));
      expect(await source.resolveCommit(SOURCE)).toBe(COMMIT_B);
    });

    it('answers unavailable when the remote cannot be reached', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A, lsRemoteAnswer: null }));
      expect(await source.resolveCommit(SOURCE)).toEqual({ kind: 'unavailable' });
    });

    it('answers unavailable when the output has no commit to parse', async () => {
      const git: GitCommand = async () => 'not a sha\n';
      const source = sourceOf(git);
      expect(await source.resolveCommit(SOURCE)).toEqual({ kind: 'unavailable' });
    });

    it('never logs the source URL — D-77, S-211 adjacent', async () => {
      const withCredential = {
        type: 'git' as const,
        url: 'https://user:topsecret@example.invalid/acme.git',
      };
      const source = sourceOf(fakeGit({ commit: COMMIT_A, lsRemoteAnswer: COMMIT_B }));

      await source.resolveCommit(withCredential);

      const serialised = JSON.stringify(logger.lines);
      expect(serialised).not.toContain('topsecret');
      expect(serialised).not.toContain(withCredential.url);
    });
  });

  describe('listPlugins', () => {
    it('lists the marketplace’s plugins, marking an unsupported source — S-204', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const result = await source.listPlugins(SOURCE);

      expect(result).toEqual([
        { name: 'one', description: 'first plugin', supported: true },
        { name: 'two', description: null, supported: false },
      ]);
    });

    it('cleans up the clone after listing — no directory left under the base', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      await source.listPlugins(SOURCE);

      expect(await fs.readdir(baseDir)).toEqual([]);
    });

    it('answers unavailable when the clone fails', async () => {
      const git: GitCommand = async () => {
        throw new Error('network unreachable');
      };
      const source = sourceOf(git);
      expect(await source.listPlugins(SOURCE)).toEqual({ kind: 'unavailable' });
    });

    it('answers unavailable when the marketplace manifest does not parse — S-203', async () => {
      const git: GitCommand = async (args) => {
        if (args[0] === 'clone') {
          const destination = args.at(-1) as string;
          mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
          writeFileSync(
            path.join(destination, '.claude-plugin', 'marketplace.json'),
            '{not json',
            'utf8',
          );
          return '';
        }
        return `${COMMIT_A}\n`;
      };
      const source = sourceOf(git);
      expect(await source.listPlugins(SOURCE)).toEqual({ kind: 'unavailable' });
    });
  });

  describe('prepare', () => {
    it('stages a supported plugin, verified by its own manifest, at the resolved commit', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const prepared = await source.prepare(SOURCE, 'one');

      if ('kind' in prepared) {
        throw new Error(`expected success, got ${prepared.kind}`);
      }
      expect(prepared.commit).toBe(COMMIT_A);
      expect(prepared.manifest.name).toBe('one');
      expect(await fs.readdir(prepared.stagedAt)).toContain('.claude-plugin');

      await source.discard(prepared.stagedAt);
    });

    it('cleans up the marketplace clone, leaving only the staged plugin behind', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const prepared = await source.prepare(SOURCE, 'one');
      if ('kind' in prepared) {
        throw new Error('expected success');
      }

      const entries = await fs.readdir(baseDir);
      expect(entries).toContain(path.basename(prepared.stagedAt));
      expect(entries.some((entry) => entry.startsWith('.clone-'))).toBe(false);

      await source.discard(prepared.stagedAt);
    });

    it('answers pluginNotFound for a name the marketplace does not list', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      expect(await source.prepare(SOURCE, 'nope')).toEqual({ kind: 'pluginNotFound' });
    });

    it('answers pathInvalid for a plugin whose source is not a supported kind — S-204', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const result = await source.prepare(SOURCE, 'two');
      expect(result).toMatchObject({ kind: 'pathInvalid' });
    });

    it('answers pathInvalid for a plugin path that escapes the marketplace repository — S-204', async () => {
      const marketplaceWithEscape = {
        name: 'acme',
        plugins: [{ name: 'escapee', description: null, source: '../../../etc' }],
      };
      const git: GitCommand = async (args) => {
        if (args[0] === 'clone') {
          const destination = args.at(-1) as string;
          mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
          writeFileSync(
            path.join(destination, '.claude-plugin', 'marketplace.json'),
            JSON.stringify(marketplaceWithEscape),
            'utf8',
          );
          return '';
        }
        return `${COMMIT_A}\n`;
      };
      const source = sourceOf(git);
      const result = await source.prepare(SOURCE, 'escapee');
      expect(result).toMatchObject({ kind: 'pathInvalid' });
    });

    it('answers pathInvalid for a plugin path that does not exist at all — S-204', async () => {
      const marketplaceWithMissingPath = {
        name: 'acme',
        plugins: [{ name: 'ghost', description: null, source: 'plugins/does-not-exist-xyz' }],
      };
      const git: GitCommand = async (args) => {
        if (args[0] === 'clone') {
          const destination = args.at(-1) as string;
          mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
          writeFileSync(
            path.join(destination, '.claude-plugin', 'marketplace.json'),
            JSON.stringify(marketplaceWithMissingPath),
            'utf8',
          );
          return '';
        }
        return `${COMMIT_A}\n`;
      };
      const source = sourceOf(git);
      const result = await source.prepare(SOURCE, 'ghost');
      expect(result).toMatchObject({ kind: 'pathInvalid' });
    });

    it('answers unavailable when the plugin’s own manifest cannot be read — S-203', async () => {
      const marketplaceNoManifest = {
        name: 'acme',
        plugins: [{ name: 'bare', description: null, source: 'plugins/bare' }],
      };
      const git: GitCommand = async (args) => {
        if (args[0] === 'clone') {
          const destination = args.at(-1) as string;
          mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
          writeFileSync(
            path.join(destination, '.claude-plugin', 'marketplace.json'),
            JSON.stringify(marketplaceNoManifest),
            'utf8',
          );
          mkdirSync(path.join(destination, 'plugins', 'bare'), { recursive: true }); // no plugin.json
          return '';
        }
        return `${COMMIT_A}\n`;
      };
      const source = sourceOf(git);
      expect(await source.prepare(SOURCE, 'bare')).toEqual({ kind: 'unavailable' });
    });

    it('answers unavailable when the commit cannot be resolved after cloning', async () => {
      const git: GitCommand = async (args) => {
        if (args[0] === 'clone') {
          return '';
        }
        return 'not-a-commit\n';
      };
      const source = sourceOf(git);
      expect(await source.prepare(SOURCE, 'one')).toEqual({ kind: 'unavailable' });
    });
  });

  describe('parseRawMarketplaceManifest — tolerant parsing, plan 13, B-47', () => {
    /** A `git` whose `clone` writes [marketplaceJson] verbatim as `marketplace.json`. */
    function gitWithMarketplace(marketplaceJson: unknown): GitCommand {
      return async (args) => {
        if (args[0] === 'clone') {
          const destination = args.at(-1) as string;
          mkdirSync(path.join(destination, '.claude-plugin'), { recursive: true });
          writeFileSync(
            path.join(destination, '.claude-plugin', 'marketplace.json'),
            JSON.stringify(marketplaceJson),
            'utf8',
          );
          return '';
        }
        return `${COMMIT_A}\n`;
      };
    }

    it('answers unavailable when the manifest is valid JSON but not an object at all', async () => {
      const source = sourceOf(gitWithMarketplace(['not', 'an', 'object']));
      expect(await source.listPlugins(SOURCE)).toEqual({ kind: 'unavailable' });
    });

    it('answers unavailable when the manifest is an object with no `plugins` array', async () => {
      const source = sourceOf(gitWithMarketplace({ name: 'acme' }));
      expect(await source.listPlugins(SOURCE)).toEqual({ kind: 'unavailable' });
    });

    it('falls back to a generic name when the manifest declares none', async () => {
      const source = sourceOf(
        gitWithMarketplace({ plugins: [{ name: 'one', source: 'plugins/one' }] }),
      );
      // The marketplace's own `name` never reaches the caller today (only its plugins do) — this
      // proves the fallback is taken (rather than throwing) by checking the call still succeeds.
      expect(await source.listPlugins(SOURCE)).toEqual([
        { name: 'one', description: null, supported: true },
      ]);
    });

    it('skips a plugin entry that is not an object, and one with no name — tolerant parsing', async () => {
      const source = sourceOf(
        gitWithMarketplace({
          name: 'acme',
          plugins: [
            'not an object',
            { description: 'no name here' },
            { name: 'one', source: 'plugins/one' },
          ],
        }),
      );

      expect(await source.listPlugins(SOURCE)).toEqual([
        { name: 'one', description: null, supported: true },
      ]);
    });
  });

  describe('commit, swap and discard', () => {
    it('moves staged content into a fresh destination, creating parent directories', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const prepared = await source.prepare(SOURCE, 'one');
      if ('kind' in prepared) {
        throw new Error('expected success');
      }

      const destination = path.join(baseDir, 'user1', 'acme', 'one');
      await source.commit(prepared.stagedAt, destination);

      expect(await fs.readdir(destination)).toContain('.claude-plugin');
      await expect(fs.stat(prepared.stagedAt)).rejects.toThrow();
    });

    it('replaces an existing destination atomically, leaving no backup behind', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      const destination = path.join(baseDir, 'user1', 'acme', 'one');
      const first = await source.prepare(SOURCE, 'one');
      if ('kind' in first) throw new Error('expected success');
      await source.commit(first.stagedAt, destination);

      const second = await source.prepare(SOURCE, 'one');
      if ('kind' in second) throw new Error('expected success');
      writeFileSync(path.join(second.stagedAt, 'marker.txt'), 'v2', 'utf8');

      await source.swap(second.stagedAt, destination);

      expect(await fs.readFile(path.join(destination, 'marker.txt'), 'utf8')).toBe('v2');
      const siblings = await fs.readdir(path.dirname(destination));
      expect(siblings).toEqual(['one']);
    });

    it('discard never throws for a directory that does not exist', async () => {
      const source = sourceOf(fakeGit({ commit: COMMIT_A }));
      await expect(source.discard(path.join(baseDir, 'nowhere'))).resolves.toBeUndefined();
    });
  });
});
