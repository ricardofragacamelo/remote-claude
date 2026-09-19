import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ConfigurationError } from '@remote-claude/config';
import { UserId } from '@domain/auth';
import { ReloadableWorkspaceAllowlist } from '@infra/config/reloadable-workspace-allowlist';
import type { AllowlistFileSystem } from '@infra/config/workspace-allowlist';

const FILE = '/etc/remote-claude/workspaces.yaml';
const owner = UserId.create('auth|owner');

const one = 'roots:\n  - { path: /srv/projects, label: Projects, users: [auth|owner] }\n';
const two = `${one}  - { path: /srv/other, label: Other, users: [auth|owner] }\n`;

/** A file whose content the test can swap between reads. */
function mutableFs(initial: string): { fs: AllowlistFileSystem; set(text: string): void } {
  let text = initial;

  return {
    set: (next) => {
      text = next;
    },
    fs: {
      read: () => text,
      realDirectory: (path) => (['/srv/projects', '/srv/other'].includes(path) ? path : null),
    },
  };
}

describe('ReloadableWorkspaceAllowlist', () => {
  it('reads the file while it is being constructed', () => {
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, mutableFs(one).fs, parseYaml);

    expect(allowlist.current().for(owner)).toHaveLength(1);
  });

  it('refuses to be constructed at all from a file it cannot validate', () => {
    // Thrown inside the container factory, so the process never reaches a state where it serves
    // requests with an allowlist nobody checked.
    expect(
      () => new ReloadableWorkspaceAllowlist(FILE, mutableFs('roots: []').fs, parseYaml),
    ).toThrow(ConfigurationError);
  });

  it('does not notice a change until it is told to', () => {
    // Never a watcher: an allowlist that grows or shrinks on its own moves the security boundary
    // without anybody deciding to — D-02.
    const file = mutableFs(one);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);

    file.set(two);

    expect(allowlist.current().for(owner)).toHaveLength(1);
  });

  it('picks the change up on an explicit reload', () => {
    const file = mutableFs(one);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);

    file.set(two);
    allowlist.reload();

    expect(allowlist.current().for(owner)).toHaveLength(2);
  });

  it('keeps the previous list when a reload fails, and says that it failed', () => {
    // Replacing a working boundary with nothing because somebody saved a half-edited file is the
    // one outcome worse than both.
    const file = mutableFs(one);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);

    file.set('roots: []');

    expect(() => {
      allowlist.reload();
    }).toThrow(ConfigurationError);
    expect(allowlist.current().for(owner)).toHaveLength(1);
  });
});
