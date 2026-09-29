import { describe, expect, it } from 'vitest';

import { PidFile } from '@infra/lifecycle/pid-file';
import type { PidFileSystem } from '@infra/lifecycle/pid-file';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** A filesystem in a map, where any one call can be made to fail. */
function memory(failing: Partial<Record<keyof PidFileSystem, Error>> = {}) {
  const files = new Map<string, string>();
  const fail = (call: keyof PidFileSystem) => {
    const error = failing[call];
    if (error !== undefined) {
      throw error;
    }
  };
  const fs: PidFileSystem = {
    mkdir: () => {
      fail('mkdir');
    },
    write: (file, text) => {
      fail('write');
      files.set(file, text);
    },
    rename: (from, to) => {
      fail('rename');
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    read: (file) => {
      fail('read');
      const text = files.get(file);
      if (text === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return text;
    },
    remove: (file) => {
      fail('remove');
      files.delete(file);
    },
  };

  return { files, fs };
}

const FILE = '/repo/.run/backend.pid';

describe('PidFile — plan 06, B-11', () => {
  it('writes the pid of this process where it was told, whole', () => {
    const { files, fs } = memory();
    const log = new RecordingLogger();

    new PidFile(FILE, log.logger, fs, 4242).onApplicationBootstrap();

    expect([...files]).toEqual([[FILE, '4242\n']]);
    expect(log.withOp('pidFile.written')).toMatchObject([{ level: 'info', pid: 4242 }]);
  });

  it('writes nothing when switched off', () => {
    const { files, fs } = memory();
    const pidFile = new PidFile(null, new RecordingLogger().logger, fs, 4242);

    pidFile.onApplicationBootstrap();
    pidFile.onApplicationShutdown();

    expect(files.size).toBe(0);
  });

  it('warns and goes on when it cannot write — a convenience never stops the boot', () => {
    const log = new RecordingLogger();
    const { fs } = memory({ write: new Error('EACCES') });

    expect(() => {
      new PidFile(FILE, log.logger, fs, 4242).onApplicationBootstrap();
    }).not.toThrow();
    expect(log.withOp('pidFile.written')).toMatchObject([{ level: 'warn' }]);
  });

  it('removes its own file on the way out', () => {
    const { files, fs } = memory();
    const pidFile = new PidFile(FILE, new RecordingLogger().logger, fs, 4242);
    pidFile.onApplicationBootstrap();

    pidFile.onApplicationShutdown();

    expect(files.size).toBe(0);
  });

  it('leaves the file of a newer process alone', () => {
    const { files, fs } = memory();
    files.set(FILE, '5151\n');

    new PidFile(FILE, new RecordingLogger().logger, fs, 4242).onApplicationShutdown();

    expect(files.get(FILE)).toBe('5151\n');
  });

  it('shuts down quietly when there is no file to remove', () => {
    const log = new RecordingLogger();
    const { fs } = memory();

    expect(() => {
      new PidFile(FILE, log.logger, fs, 4242).onApplicationShutdown();
    }).not.toThrow();
    expect(log.withOp('pidFile.removed')).toMatchObject([{ level: 'debug' }]);
  });
});
