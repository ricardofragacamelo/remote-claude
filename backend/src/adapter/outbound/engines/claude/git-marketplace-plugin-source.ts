import { promises as fs } from 'node:fs';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import type {
  MarketplacePluginSource,
  MarketplaceSourceFailure,
  PluginManifestReader,
  PreparedMarketplacePlugin,
} from '@application/engines/claude';
import { PLUGIN_MANIFEST_READER } from '@application/engines/claude';
import type { DeclaredMarketplace } from '@application/workspace';
import type { MarketplacePluginEntry } from '@domain/engines/claude';
import { WorkspacePath } from '@domain/workspace';
import { execFileText } from '@shared/process/exec-file-text';
import { hostEnvironment } from '@shared/process/host-environment';
import { isPlainObject } from '@shared/utils/plain-object';
import { stringField } from '@shared/utils/string-field';
import { LOGGER } from '@shared/logging/logger';
import type { Logger } from '@shared/logging/logger';
import { readJsonWithin } from './plugin-fs-read';

/** How long a shallow clone of a marketplace's git source gets — read-only, over the network. */
export const GIT_CLONE_TIMEOUT_MS = 30_000;

/** How long a bare `ls-remote` gets — far cheaper than a clone, so a far shorter ceiling. */
export const GIT_LS_REMOTE_TIMEOUT_MS = 10_000;

const MARKETPLACE_MANIFEST_PATH = ['.claude-plugin', 'marketplace.json'];
const FULL_COMMIT_LENGTH = 40;

/** What this adapter is configured with (plan 13, B-47) — never the raw `ClaudeSettings` of the module. */
export interface MarketplacePluginSourceSettings {
  /** Where a plugin's content is staged and, afterwards, installed under — one subtree per user. */
  readonly baseDir: string;
}

export const MARKETPLACE_PLUGIN_SOURCE_SETTINGS = Symbol('MarketplacePluginSourceSettings');

/** Runs one `git` subprocess and answers its stdout, or rejects. Injectable, so a unit test runs no `git`. */
export type GitCommand = (
  args: readonly string[],
  options: { readonly cwd?: string; readonly timeoutMs: number },
) => Promise<string>;

/**
 * `git`, with the machine's environment minus the backend's own (plan 13, B-20) — over
 * {@link execFileText}, the same `execFile`-as-text convention
 * {@link import('./installation-facts.adapter').runPathCli} uses: never a shell string, so nothing
 * in a marketplace's URL or a plugin's name is ever interpreted by a shell.
 * `GIT_TERMINAL_PROMPT=0` is ours, added on top — never a credential, a refusal to let an
 * unreachable private repository hang the request waiting for a password nobody can type.
 */
export const runGit: GitCommand = (args, { cwd, timeoutMs }) =>
  execFileText('git', args, {
    ...(cwd === undefined ? {} : { cwd }),
    timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...hostEnvironment(process.env), GIT_TERMINAL_PROMPT: '0' },
  });

/** One entry of a marketplace's manifest, before its `source` is judged supported or not. */
interface RawMarketplaceEntry {
  readonly name: string;
  readonly description: string | null;
  readonly source: unknown;
}

interface RawMarketplaceManifest {
  readonly name: string;
  readonly plugins: readonly RawMarketplaceEntry[];
}

/**
 * Parses the published Claude Code marketplace format — name, owner/description at the top, a
 * `plugins` array each with at least a `name` and a `source` (plan 13, B-47) — tolerating unknown or
 * extra fields, refusing only what does not have this shape at all.
 */
function parseRawMarketplaceManifest(json: unknown): RawMarketplaceManifest | null {
  if (!isPlainObject(json) || !Array.isArray(json['plugins'])) {
    return null;
  }

  const name = stringField(json['name']) ?? 'marketplace';
  const plugins: RawMarketplaceEntry[] = [];

  for (const entry of json['plugins']) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const entryName = stringField(entry['name']);
    if (entryName === null) {
      continue;
    }
    plugins.push({
      name: entryName,
      description: stringField(entry['description']),
      source: entry['source'],
    });
  }

  return { name, plugins };
}

/** The first 40-hex-character token of `git ls-remote`'s output, or `null` when there is none. */
function commitInLsRemote(output: string): string | null {
  return /^([0-9a-f]{40})\s/m.exec(output)?.[1] ?? null;
}

/**
 * Clones a declared marketplace's git source and hands a plugin's files back, never running
 * anything it downloads (plan 13, B-47; D-15, D-68) — `git clone`/`rev-parse`/`ls-remote` and a
 * directory move, nothing else: no install script of any kind, no `claude plugin`, no write under
 * `~/.claude` (S-211).
 *
 * A marketplace's own catalogue is not cached (D-70): every call clones or asks the remote fresh.
 * The marketplace repositories this product's installations declare are small, and the simplicity
 * of "never stale" was judged worth the extra network round trip — a cache is the documented path
 * if a real marketplace ever makes that cost matter.
 */
@Injectable()
export class GitMarketplacePluginSource implements MarketplacePluginSource {
  constructor(
    @Inject(MARKETPLACE_PLUGIN_SOURCE_SETTINGS)
    private readonly settings: MarketplacePluginSourceSettings,
    @Inject(PLUGIN_MANIFEST_READER) private readonly manifests: PluginManifestReader,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly git: GitCommand = runGit,
  ) {}

  async listPlugins(
    source: DeclaredMarketplace['source'],
  ): Promise<readonly MarketplacePluginEntry[] | MarketplaceSourceFailure> {
    return this.withClone(source, (cloned) =>
      Promise.resolve(
        cloned.manifest.plugins.map((entry) => ({
          name: entry.name,
          description: entry.description,
          supported: typeof entry.source === 'string',
        })),
      ),
    );
  }

  async resolveCommit(
    source: DeclaredMarketplace['source'],
  ): Promise<string | MarketplaceSourceFailure> {
    try {
      const output = await this.runGit(['ls-remote', source.url, 'HEAD'], GIT_LS_REMOTE_TIMEOUT_MS);
      const commit = commitInLsRemote(output);
      return commit ?? { kind: 'unavailable' };
    } catch (error) {
      this.logDebug('resolveCommit', source, error);
      return { kind: 'unavailable' };
    }
  }

  async prepare(
    source: DeclaredMarketplace['source'],
    pluginName: string,
  ): Promise<PreparedMarketplacePlugin | MarketplaceSourceFailure> {
    return this.withClone(source, async (cloned) => {
      const entry = cloned.manifest.plugins.find((candidate) => candidate.name === pluginName);
      if (entry === undefined) {
        return { kind: 'pluginNotFound' };
      }
      if (typeof entry.source !== 'string') {
        return { kind: 'pathInvalid', reason: 'the plugin source is not a supported kind' };
      }

      const candidate = path.join(cloned.cloneDir, entry.source);
      const real = await fs.realpath(candidate).catch(() => null);
      if (
        real === null ||
        !WorkspacePath.create(real).isWithin(WorkspacePath.create(cloned.cloneDir))
      ) {
        return {
          kind: 'pathInvalid',
          reason: 'the plugin path escapes the marketplace repository',
        };
      }

      const stagedAt = await fs.mkdtemp(path.join(this.settings.baseDir, '.plugin-'));
      await fs.rm(stagedAt, { recursive: true, force: true });
      await fs.rename(real, stagedAt);

      const read = await this.manifests.read(stagedAt);
      if (typeof read === 'string') {
        await this.remove(stagedAt);
        return { kind: 'unavailable' };
      }

      return { manifest: read.manifest, digest: read.digest, commit: cloned.commit, stagedAt };
    });
  }

  async commit(stagedAt: string, destination: string): Promise<void> {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(stagedAt, destination);
  }

  async swap(stagedAt: string, destination: string): Promise<void> {
    const backup = `${destination}.outgoing-${path.basename(stagedAt)}`;
    await fs.rename(destination, backup);

    try {
      await fs.rename(stagedAt, destination);
    } catch (error) {
      await fs.rename(backup, destination);
      throw error;
    }

    await this.remove(backup);
  }

  async discard(directory: string): Promise<void> {
    await this.remove(directory);
  }

  /**
   * Clones [source], hands the clone to [fn], and always removes the clone afterward — the one
   * shape {@link listPlugins} and {@link prepare} both need around a fresh clone.
   */
  private async withClone<T>(
    source: DeclaredMarketplace['source'],
    fn: (cloned: {
      readonly cloneDir: string;
      readonly commit: string;
      readonly manifest: RawMarketplaceManifest;
    }) => Promise<T | MarketplaceSourceFailure>,
  ): Promise<T | MarketplaceSourceFailure> {
    const cloned = await this.cloneAndRead(source);
    if (cloned === null) {
      return { kind: 'unavailable' };
    }

    try {
      return await fn(cloned);
    } finally {
      await this.remove(cloned.cloneDir);
    }
  }

  /** Clones [source] into a fresh directory under the configured base, and reads its manifest. */
  private async cloneAndRead(source: DeclaredMarketplace['source']): Promise<{
    readonly cloneDir: string;
    readonly commit: string;
    readonly manifest: RawMarketplaceManifest;
  } | null> {
    await fs.mkdir(this.settings.baseDir, { recursive: true });
    const cloneDir = await fs.mkdtemp(path.join(this.settings.baseDir, '.clone-'));
    // A fresh `mkdtemp` directory is not empty to `git clone` by name alone — it is empty by
    // content, which is what `git` actually requires; nothing further to do before cloning into it.

    try {
      await this.runGit(
        ['clone', '--quiet', '--depth', '1', '--no-tags', source.url, cloneDir],
        GIT_CLONE_TIMEOUT_MS,
      );
      const commit = (
        await this.runGit(['rev-parse', 'HEAD'], GIT_CLONE_TIMEOUT_MS, cloneDir)
      ).trim();
      if (commit.length !== FULL_COMMIT_LENGTH) {
        await this.remove(cloneDir);
        return null;
      }

      const json = await readJsonWithin(cloneDir, MARKETPLACE_MANIFEST_PATH).catch(() => undefined);
      const manifest = json === undefined ? null : parseRawMarketplaceManifest(json);
      if (manifest === null) {
        await this.remove(cloneDir);
        return null;
      }

      return { cloneDir, commit, manifest };
    } catch (error) {
      this.logDebug('clone', source, error);
      await this.remove(cloneDir);
      return null;
    }
  }

  private runGit(args: readonly string[], timeoutMs: number, cwd?: string): Promise<string> {
    // Never the full argument list: a declared source is a plain public git URL today (D-77 — an
    // authenticated one is a documented scope cut, not something this logs around), but the one
    // argument that could ever carry a credential (`user:pass@host` in a URL) is never put in a log
    // line on the strength of a feature not being supported — only the subcommand is named.
    this.logger.debug(
      { op: 'engine.marketplace.git', layer: 'adapter', subcommand: args[0] },
      'running git for a declared marketplace',
    );
    return this.git(args, cwd === undefined ? { timeoutMs } : { cwd, timeoutMs });
  }

  private async remove(directory: string): Promise<void> {
    await fs.rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
      this.logger.debug(
        { op: 'engine.marketplace.cleanup', layer: 'adapter', directory, err: error },
        'could not remove a marketplace staging directory',
      );
    });
  }

  private logDebug(op: string, source: DeclaredMarketplace['source'], error: unknown): void {
    this.logger.debug(
      { op: `engine.marketplace.${op}`, layer: 'adapter', sourceType: source.type, err: error },
      'a marketplace git operation failed',
    );
  }
}
