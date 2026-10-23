import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitMarketplacePluginSource } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import type { GitCommand } from '@adapter/outbound/engines/claude/git-marketplace-plugin-source';
import { ClaudePluginManifestReader } from '@adapter/outbound/engines/claude/plugin-manifest.reader';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

// `vi.hoisted` so this exists by the time `vi.mock` below — itself hoisted above every import of
// this file — runs; a plain top-level `const` would still throw "before initialization".
const rmMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());

// Only `promises.rm` is overridden; every other export (including the sync helpers the sibling
// spec file in this same directory uses) stays the real implementation, so this stays a narrow,
// single-purpose mock rather than a reimplementation of `node:fs`.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: { ...actual.promises, rm: rmMock },
  };
});

/**
 * {@link GitMarketplacePluginSource.discard} never lets a failure to remove a staging directory
 * reach its caller (plan 13, B-47) — a leftover temp directory is a disk-cleanup nuisance, never a
 * reason an install or update itself should fail. Covered in its own file, with its own
 * `node:fs` mock, so the sibling spec file's real-filesystem fixtures stay untouched by it.
 */
describe('GitMarketplacePluginSource — cleanup never throws, plan 13, B-47', () => {
  afterEach(() => {
    rmMock.mockReset();
  });

  it('logs and swallows the error when a staging directory cannot be removed', async () => {
    const logger = new RecordingLogger();
    const manifests = new ClaudePluginManifestReader();
    const git: GitCommand = async () => '';
    const source = new GitMarketplacePluginSource(
      { baseDir: path.join('/tmp', 'rc-marketplace-cleanup-unused') },
      manifests,
      logger.logger,
      git,
    );
    rmMock.mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(source.discard('/fake/staged/dir')).resolves.toBeUndefined();

    expect(rmMock).toHaveBeenCalledWith('/fake/staged/dir', { recursive: true, force: true });
    expect(logger.withOp('engine.marketplace.cleanup')).toEqual([
      expect.objectContaining({
        msg: 'could not remove a marketplace staging directory',
        directory: '/fake/staged/dir',
      }),
    ]);
  });
});
