import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import type { RestoredFile, UndoDisk } from '@application/session';
import type { FileObservation, TurnFileCheckpoint } from '@domain/session';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { digestOf, isAbsent } from './file-facts';

const CONTEXT = { op: 'checkpoint.restore', layer: 'adapter' } as const;

/**
 * The disk, as the undo is allowed to touch it — plan 04, B-21.
 *
 * Three requirements became ours the moment the revert stopped being the SDK's
 * ([D-06](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir)):
 *
 * - **never through a link** (S-65). A path that became a symbolic link, a hard link or anything
 *   but a regular file, or whose directory no longer resolves to itself, is `unsafe`, and the undo
 *   leaves it. The SDK reported these as `skippedLinks`; without the check, a restore is a way of
 *   writing wherever a link points;
 * - **atomic per file** (S-66). The snapshot is written to a temporary file **in the same
 *   directory** and renamed over the path — a rename within one filesystem is atomic, so a failure
 *   halfway leaves the file exactly as it was, never truncated;
 * - **the snapshot is checked**. Its hash was recorded when it was taken; a blob that no longer
 *   matches is refused rather than written over somebody's file.
 *
 * Contents never reach the log — only paths, sizes and outcomes.
 */
@Injectable()
export class NodeUndoDisk implements UndoDisk {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  async observe(filePath: string): Promise<FileObservation> {
    const observation = await this.look(filePath);

    this.logger.debug(
      { ...CONTEXT, op: 'checkpoint.observe', path: filePath, kind: observation.kind },
      'looked at a path the undo reaches',
    );

    return observation;
  }

  async restore(checkpoint: TurnFileCheckpoint): Promise<RestoredFile> {
    const target = checkpoint.path;
    const temporary = path.join(
      path.dirname(target),
      `.${path.basename(target)}.rc-undo-${randomUUID()}`,
    );

    try {
      const content = await this.snapshotOf(checkpoint);
      const current = await this.regularOrAbsent(target);

      // `wx`: the temporary is ours and new, never a file that happened to be there already.
      await writeFile(temporary, content, {
        flag: 'wx',
        ...(current === null ? {} : { mode: current.mode & 0o7777 }),
      });
      await rename(temporary, target);

      const written = await stat(target);
      this.logger.debug(
        { ...CONTEXT, path: target, action: 'restored', sizeBytes: written.size },
        'a file was put back the way it was before the turn',
      );

      return { mtime: written.mtime, sizeBytes: written.size };
    } catch (error) {
      await rm(temporary, { force: true });
      this.logger.warn(
        { ...CONTEXT, path: target, action: 'restore', err: error },
        'a file could not be put back — it is exactly as it was',
      );
      throw error;
    }
  }

  async remove(filePath: string): Promise<void> {
    try {
      if ((await this.regularOrAbsent(filePath)) !== null) {
        await unlink(filePath);
      }

      this.logger.debug(
        { ...CONTEXT, path: filePath, action: 'deleted' },
        'a file the undone turn created was removed',
      );
    } catch (error) {
      this.logger.warn(
        { ...CONTEXT, path: filePath, action: 'delete', err: error },
        'a file the undone turn created could not be removed',
      );
      throw error;
    }
  }

  /** What is at the path, as {@link observe} reports it. */
  private async look(filePath: string): Promise<FileObservation> {
    if (!path.isAbsolute(filePath) || !(await resolvesToItself(path.dirname(filePath)))) {
      return { kind: 'unsafe' };
    }

    let stats: Stats;
    try {
      stats = await lstat(filePath);
    } catch (error) {
      return isAbsent(error) ? { kind: 'absent' } : { kind: 'unsafe' };
    }

    if (!isPlainFile(stats)) {
      return { kind: 'unsafe' };
    }

    return { kind: 'file', hash: digestOf(await readFile(filePath)) };
  }

  /**
   * The contents a checkpoint kept, verified against the hash taken with them.
   *
   * @throws when there is no blob, it cannot be read, or it is not what was snapshotted
   */
  private async snapshotOf(checkpoint: TurnFileCheckpoint): Promise<Buffer> {
    if (checkpoint.blobPath === null || checkpoint.hash === null) {
      throw new Error(`no snapshot was kept for ${checkpoint.path}`);
    }

    const content = await readFile(checkpoint.blobPath);

    if (digestOf(content) !== checkpoint.hash) {
      throw new Error(`the snapshot of ${checkpoint.path} no longer matches its hash`);
    }

    return content;
  }

  /**
   * The path's stats when it is a plain file, `null` when nothing is there.
   *
   * Asked again right before the write, because the plan was made a moment ago and a path can turn
   * into a link in between; a rename over a link would replace the link, but a check that ran only
   * once would be a check about a different moment.
   *
   * @throws when the path is anything the undo does not write
   */
  private async regularOrAbsent(filePath: string): Promise<Stats | null> {
    if (!(await resolvesToItself(path.dirname(filePath)))) {
      throw new Error(`the directory of ${filePath} no longer resolves to itself`);
    }

    let stats: Stats;
    try {
      stats = await lstat(filePath);
    } catch (error) {
      if (isAbsent(error)) {
        return null;
      }
      throw error;
    }

    if (!isPlainFile(stats)) {
      throw new Error(`${filePath} is no longer a plain file`);
    }

    return stats;
  }
}

/** A regular file with one name: not a link of either kind, not a directory, not a device. */
function isPlainFile(stats: Stats): boolean {
  return stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1;
}

/**
 * Whether a directory resolves to exactly itself — no link anywhere on the way to it.
 *
 * The path the journal recorded was the real one when the session wrote it; a directory that now
 * resolves elsewhere is one somebody replaced with a link, and writing into it would write there.
 */
async function resolvesToItself(directory: string): Promise<boolean> {
  try {
    return (await realpath(directory)) === directory;
  } catch {
    // A directory that is not there at all resolves to nothing, which is the same answer: the undo
    // will not create directories to put a file back into.
    return false;
  }
}
