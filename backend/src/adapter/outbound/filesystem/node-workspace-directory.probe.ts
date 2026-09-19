import { Inject, Injectable } from '@nestjs/common';
import { realpath, stat } from 'node:fs/promises';

import type { DirectoryInspection, WorkspaceDirectoryProbe } from '@application/workspace';
import { LOGGER, type Logger } from '@shared/logging/logger';

/** Errors that mean "there is nothing at that path", as opposed to "I could not look". */
const ABSENT = new Set(['ENOENT', 'ENOTDIR']);

/**
 * The filesystem, as the `workspace` module sees it.
 *
 * `realpath` and not `stat` alone: the containment rule has to run against what will actually be
 * opened, and a symlink inside an allowed root pointing outside it is the classic way past a path
 * check (S-12).
 *
 * A permission error is **not** "missing". Answering `missing` for a directory we were not allowed
 * to look at would turn "I cannot tell" into "it is not there", and the caller would report a
 * `404` for something that exists — the one case where failing closed means propagating the error.
 */
@Injectable()
export class NodeWorkspaceDirectoryProbe implements WorkspaceDirectoryProbe {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  async inspect(path: string): Promise<DirectoryInspection> {
    const startedAt = Date.now();
    this.logger.debug({ op: 'fs.inspect', layer: 'adapter', path }, 'inspecting a path');

    const inspection = await this.look(path);

    this.logger.debug(
      {
        op: 'fs.inspected',
        layer: 'adapter',
        path,
        kind: inspection.kind,
        durationMs: Date.now() - startedAt,
      },
      'path inspected',
    );

    return inspection;
  }

  private async look(path: string): Promise<DirectoryInspection> {
    try {
      const real = await realpath(path);

      return { kind: 'present', realPath: real, isDirectory: (await stat(real)).isDirectory() };
    } catch (error) {
      if (isAbsent(error)) {
        return { kind: 'missing' };
      }

      // Swallowing this would report "not found" for a directory that is there, so it is logged
      // and re-thrown: the request fails with a `500`, which is the honest answer for "our side
      // could not look".
      this.logger.error({ op: 'fs.inspected', layer: 'adapter', path, err: error }, 'cannot look');
      throw error;
    }
  }
}

/** Whether the failure means the path is not there, rather than that we could not look. */
function isAbsent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ABSENT.has((error as { code: string }).code)
  );
}
