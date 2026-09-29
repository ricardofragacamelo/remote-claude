import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { AllowlistReloadSignal, RELOAD_SIGNAL } from '@infra/config/allowlist-reload.signal';
import { ReloadableWorkspaceAllowlist } from '@infra/config/reloadable-workspace-allowlist';
import type { AllowlistFileSystem } from '@infra/config/workspace-allowlist';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

const FILE = '/etc/remote-claude/workspaces.yaml';
const one = 'roots:\n  - { path: /srv/projects, label: Projects, users: [auth|owner] }\n';
const two = `${one}  - { path: /srv/other, label: Other, users: [auth|owner] }\n`;

function setUp(initial = one) {
  let text = initial;
  const fs: AllowlistFileSystem = {
    read: () => text,
    realDirectory: (path) => (['/srv/projects', '/srv/other'].includes(path) ? path : null),
  };
  const log = new RecordingLogger();
  const signals = new EventEmitter();
  const allowlist = new ReloadableWorkspaceAllowlist(FILE, fs, parseYaml);
  const signal = new AllowlistReloadSignal(allowlist, log.logger, signals);

  return {
    log,
    signals,
    allowlist,
    signal,
    write: (next: string) => {
      text = next;
    },
  };
}

describe('AllowlistReloadSignal — plan 06, B-11', () => {
  it('listens to SIGHUP once the application is up, and reloads on it — S-62', () => {
    const { signal, signals, allowlist, write, log } = setUp();
    signal.onApplicationBootstrap();
    write(two);

    signals.emit(RELOAD_SIGNAL);

    expect(allowlist.roots()).toEqual(['/srv/projects', '/srv/other']);
    expect(log.withOp('allowlist.reloaded')).toMatchObject([
      { level: 'info', file: FILE, added: ['/srv/other'], removed: [] },
    ]);
  });

  it('says which roots left', () => {
    const { signal, write, log } = setUp(two);
    write(one);

    signal.reload();

    expect(log.withOp('allowlist.reloaded')).toMatchObject([
      { added: [], removed: ['/srv/other'] },
    ]);
  });

  it('keeps the list and logs every problem when the file is invalid — S-63', () => {
    const { signal, write, allowlist, log } = setUp();
    write('roots: []');

    signal.reload();

    expect(allowlist.roots()).toEqual(['/srv/projects']);
    expect(log.withOp('allowlist.reloaded')).toMatchObject([
      { level: 'error', problems: [expect.stringContaining('roots')] },
    ]);
  });

  it('logs a failure that is not a configuration problem too, without throwing', () => {
    const log = new RecordingLogger();
    const broken = {
      file: FILE,
      reload: () => {
        throw new Error('disk on fire');
      },
    } as unknown as ReloadableWorkspaceAllowlist;

    expect(() => {
      new AllowlistReloadSignal(broken, log.logger, new EventEmitter()).reload();
    }).not.toThrow();
    expect(log.withOp('allowlist.reloaded')[0]).toMatchObject({ level: 'error' });
    expect(log.withOp('allowlist.reloaded')[0]?.['problems']).toBeUndefined();
  });

  it('stops listening when the application shuts down', () => {
    const { signal, signals } = setUp();
    signal.onApplicationBootstrap();

    signal.onApplicationShutdown();

    expect(signals.listenerCount(RELOAD_SIGNAL)).toBe(0);
  });

  it('listens on the process itself by default', () => {
    const { allowlist, log } = setUp();
    const signal = new AllowlistReloadSignal(allowlist, log.logger);
    const before = process.listenerCount(RELOAD_SIGNAL);

    signal.onApplicationBootstrap();
    const during = process.listenerCount(RELOAD_SIGNAL);
    signal.onApplicationShutdown();

    expect(during).toBe(before + 1);
    expect(process.listenerCount(RELOAD_SIGNAL)).toBe(before);
  });
});
