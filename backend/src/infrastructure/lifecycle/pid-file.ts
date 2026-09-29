import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import type { Logger } from '@shared/logging/logger';

/** The calls the pid file makes, so a test can fail one of them on purpose. */
export interface PidFileSystem {
  mkdir(directory: string): void;
  write(file: string, text: string): void;
  rename(from: string, to: string): void;
  read(file: string): string;
  remove(file: string): void;
}

const nodePidFileSystem: PidFileSystem = {
  mkdir: (directory) => mkdirSync(directory, { recursive: true }),
  write: (file, text) => {
    writeFileSync(file, text, 'utf8');
  },
  rename: renameSync,
  read: (file) => readFileSync(file, 'utf8'),
  remove: unlinkSync,
};

/**
 * The pid of **this** process, where `pnpm allowlist` looks for it (06 · D-15).
 *
 * The app writes its own pid rather than the development script recording one: under `pnpm dev`
 * the backend runs beneath a watcher that restarts it on every change, so the pid the script
 * spawned is the watcher's — and `SIGHUP` sent there would end the watcher, not reload the
 * allowlist. The process that holds the allowlist is the only one that knows its pid for sure.
 *
 * A convenience of development, and it behaves like one: failing to write it is a `warn`, never a
 * failed boot. On the way out the file is removed only while it still names this process, so a
 * backend stopping late never deletes the pid of the one that replaced it.
 */
export class PidFile implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly file: string | null,
    private readonly logger: Logger,
    private readonly fs: PidFileSystem = nodePidFileSystem,
    private readonly pid: number = process.pid,
  ) {}

  onApplicationBootstrap(): void {
    if (this.file === null) {
      return;
    }

    const context = { op: 'pidFile.written', layer: 'infrastructure', file: this.file };

    try {
      // Written beside and renamed over, so a reader never sees half a number.
      const temporary = `${this.file}.${String(this.pid)}.tmp`;

      this.fs.mkdir(dirname(this.file));
      this.fs.write(temporary, `${String(this.pid)}\n`);
      this.fs.rename(temporary, this.file);
      this.logger.info({ ...context, pid: this.pid }, 'pid file written');
    } catch (error) {
      this.logger.warn({ ...context, err: error }, 'the pid file could not be written');
    }
  }

  onApplicationShutdown(): void {
    if (this.file === null) {
      return;
    }

    try {
      if (this.fs.read(this.file).trim() === String(this.pid)) {
        this.fs.remove(this.file);
      }
    } catch (error) {
      // Already gone, or never written: either way there is nothing of ours left to remove.
      this.logger.debug(
        { op: 'pidFile.removed', layer: 'infrastructure', file: this.file, err: error },
        'no pid file of this process to remove',
      );
    }
  }
}
