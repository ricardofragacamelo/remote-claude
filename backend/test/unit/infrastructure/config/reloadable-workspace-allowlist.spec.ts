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

describe('ReloadableWorkspaceAllowlist, as plan 06 reloads it', () => {
  it('answers the roots it holds, in the order of the file', () => {
    expect(new ReloadableWorkspaceAllowlist(FILE, mutableFs(two).fs, parseYaml).roots()).toEqual([
      '/srv/projects',
      '/srv/other',
    ]);
  });

  it('says what a reload changed — S-62', () => {
    const file = mutableFs(one);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);

    file.set(two);
    expect(allowlist.reload()).toEqual({ added: ['/srv/other'], removed: [] });

    file.set(one);
    expect(allowlist.reload()).toEqual({ added: [], removed: ['/srv/other'] });
  });

  it('keeps the file it reads, for the log to name', () => {
    expect(new ReloadableWorkspaceAllowlist(FILE, mutableFs(one).fs, parseYaml).file).toBe(FILE);
  });
});

const withMarketplace = `${one}marketplaces:\n  - name: acme\n    source: { type: git, url: https://example.invalid/acme.git }\n`;

describe('ReloadableWorkspaceAllowlist — declared marketplaces (plan 13, B-47)', () => {
  it('is off — finds and lists nothing — when the file declares none at all', () => {
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, mutableFs(one).fs, parseYaml);

    expect(allowlist.list()).toEqual([]);
    expect(allowlist.find('acme')).toBeNull();
  });

  it('finds a declared marketplace by name — S-202', () => {
    const allowlist = new ReloadableWorkspaceAllowlist(
      FILE,
      mutableFs(withMarketplace).fs,
      parseYaml,
    );

    expect(allowlist.list()).toEqual([
      { name: 'acme', source: { type: 'git', url: 'https://example.invalid/acme.git' } },
    ]);
    expect(allowlist.find('acme')).toEqual({
      name: 'acme',
      source: { type: 'git', url: 'https://example.invalid/acme.git' },
    });
    expect(allowlist.find('nope')).toBeNull();
  });

  it('stops finding a marketplace a reload removes — S-213', () => {
    const file = mutableFs(withMarketplace);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);
    expect(allowlist.find('acme')).not.toBeNull();

    file.set(one);
    allowlist.reload();

    expect(allowlist.find('acme')).toBeNull();
    expect(allowlist.list()).toEqual([]);
  });

  it('starts finding a marketplace a reload adds', () => {
    const file = mutableFs(one);
    const allowlist = new ReloadableWorkspaceAllowlist(FILE, file.fs, parseYaml);
    expect(allowlist.find('acme')).toBeNull();

    file.set(withMarketplace);
    allowlist.reload();

    expect(allowlist.find('acme')).not.toBeNull();
  });

  it('refuses to be constructed from a `marketplaces` section that fails the schema', () => {
    const malformed = `${one}marketplaces:\n  - name: acme\n`;

    expect(
      () => new ReloadableWorkspaceAllowlist(FILE, mutableFs(malformed).fs, parseYaml),
    ).toThrow(ConfigurationError);
  });
});
