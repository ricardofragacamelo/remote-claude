import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PidFile } from '@infra/lifecycle/pid-file';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** The pid file on a real disk: the directory made, the file written, and taken away again. */
describe('PidFile on a real disk', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'rc-pid-'));

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates the directory, writes the pid of this process, and removes it on the way out', () => {
    const file = path.join(directory, '.run', 'backend.pid');
    const pidFile = new PidFile(file, new RecordingLogger().logger);

    pidFile.onApplicationBootstrap();
    expect(readFileSync(file, 'utf8')).toBe(`${String(process.pid)}\n`);

    pidFile.onApplicationShutdown();
    expect(existsSync(file)).toBe(false);
  });
});
