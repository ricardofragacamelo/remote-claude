import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A real local git repository, published as a marketplace (plan 13, B-47) — no network, the same
 * "local fixture, never a real network dependency" discipline D-19 already set for MCP: the backend
 * clones this exactly as it would clone a real one, over `git`'s own local-path support, and the
 * suite controls every commit.
 */
export interface GitMarketplaceFixture {
  /** The repository's path — usable directly as a marketplace's `source.url` (no `file://` needed). */
  readonly url: string;

  /** Writes [files] (path within the repo → content), commits, and answers the new commit's SHA. */
  commit(files: Readonly<Record<string, string>>, message?: string): string;

  /** The repository's current `HEAD`. */
  head(): string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A fresh git repository at a temporary path, with an initial empty commit so `HEAD` exists. */
export function createGitMarketplaceFixture(): GitMarketplaceFixture {
  const url = mkdtempSync(path.join(tmpdir(), 'rc-marketplace-fixture-'));

  git(url, 'init', '--quiet', '--initial-branch=main');
  git(url, 'config', 'user.email', 'fixture@example.invalid');
  git(url, 'config', 'user.name', 'Fixture');
  writeFileSync(path.join(url, '.gitkeep'), '', 'utf8');
  git(url, 'add', '-A');
  git(url, 'commit', '--quiet', '-m', 'init');

  return {
    url,
    commit(files, message = 'update') {
      for (const [relative, content] of Object.entries(files)) {
        const absolute = path.join(url, relative);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, content, 'utf8');
      }
      git(url, 'add', '-A');
      git(url, 'commit', '--quiet', '-m', message);
      return git(url, 'rev-parse', 'HEAD').trim();
    },
    head(): string {
      return git(url, 'rev-parse', 'HEAD').trim();
    },
  };
}

/**
 * The JSON of a marketplace manifest, with [plugins] as `{name, source}` pairs. `source` is usually
 * a relative path (the one shape this product clones), but a test proving S-204's "unsupported
 * source kind" passes an object instead — the real published format allows either.
 */
export function marketplaceManifestJson(
  name: string,
  plugins: readonly {
    readonly name: string;
    readonly source: string | Record<string, unknown>;
    readonly description?: string;
  }[],
): string {
  return JSON.stringify({ name, plugins });
}

/** The JSON of a plugin's own manifest — minimal, by name, with whatever else a test wants to vary. */
export function pluginManifestJson(name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name, ...extra });
}
