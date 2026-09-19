import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ConfigurationError } from '@remote-claude/config';
import { UserId } from '@domain/auth';
import { loadWorkspaceAllowlist } from '@infra/config/workspace-allowlist';
import type { AllowlistFileSystem } from '@infra/config/workspace-allowlist';

const FILE = '/etc/remote-claude/workspaces.yaml';

const VALID = `
# Why this root is here.
roots:
  - path: /srv/projects
    label: Projects
    users:
      - auth|owner
`;

/** A filesystem that answers exactly what a test says, and nothing it did not say. */
function fakeFs(
  text: string,
  directories: readonly string[] = ['/srv/projects'],
  links: Readonly<Record<string, string>> = {},
): AllowlistFileSystem {
  return {
    read: (file) => {
      if (file !== FILE) {
        throw new Error('ENOENT');
      }
      return text;
    },
    realDirectory: (path) => {
      const real = links[path] ?? path;
      return directories.includes(real) ? real : null;
    },
  };
}

/** The problems a load reported, or a failure if it did not report any. */
function problemsOf(load: () => unknown): readonly string[] {
  try {
    load();
  } catch (error) {
    return (error as ConfigurationError).problems;
  }

  throw new Error('the load was expected to fail and did not');
}

describe('loadWorkspaceAllowlist', () => {
  it('reads a root, its label and its users', () => {
    const [workspace] = loadWorkspaceAllowlist(FILE, fakeFs(VALID), parseYaml);

    expect(workspace?.root.value).toBe('/srv/projects');
    expect(workspace?.label).toBe('Projects');
    expect(workspace?.allows(UserId.create('auth|owner'))).toBe(true);
  });

  it('accepts the comments the file exists to carry', () => {
    // The reason this configuration is a file and not an environment variable — D-02.
    expect(loadWorkspaceAllowlist(FILE, fakeFs(VALID), parseYaml)).toHaveLength(1);
  });

  it('reads every root, not only the first', () => {
    const text = `
roots:
  - { path: /srv/projects, label: A, users: [auth|owner] }
  - { path: /srv/other, label: B, users: [auth|other] }
`;

    const loaded = loadWorkspaceAllowlist(
      FILE,
      fakeFs(text, ['/srv/projects', '/srv/other']),
      parseYaml,
    );

    expect(loaded.map((workspace) => workspace.label)).toEqual(['A', 'B']);
  });

  describe('what stops the process from starting — S-18', () => {
    it('refuses an allowlist with no roots at all', () => {
      // A backend up with an open or empty allowlist is worse than a backend that is down: down
      // is visible.
      expect(() => loadWorkspaceAllowlist(FILE, fakeFs('roots: []'), parseYaml)).toThrow(
        ConfigurationError,
      );
    });

    it('refuses a file with no `roots` key', () => {
      expect(() => loadWorkspaceAllowlist(FILE, fakeFs('other: 1'), parseYaml)).toThrow(
        ConfigurationError,
      );
    });

    it('refuses a relative root, instead of resolving it into something absolute', () => {
      const text = 'roots:\n  - { path: projects, label: A, users: [auth|owner] }\n';

      expect(problemsOf(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml))[0]).toContain(
        'must be absolute',
      );
    });

    it('refuses a root that does not exist on disk', () => {
      const text = 'roots:\n  - { path: /srv/gone, label: A, users: [auth|owner] }\n';

      expect(problemsOf(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml))[0]).toContain(
        'not an existing directory',
      );
    });

    it('refuses a root that exists and is a file', () => {
      const text = 'roots:\n  - { path: /srv/projects/readme.md, label: A, users: [auth|owner] }\n';

      expect(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml)).toThrow(
        ConfigurationError,
      );
    });

    it('refuses a root nobody is allowed to use', () => {
      const text = 'roots:\n  - { path: /srv/projects, label: A, users: [] }\n';

      expect(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml)).toThrow(
        ConfigurationError,
      );
    });

    it('refuses a root without a label', () => {
      const text = 'roots:\n  - { path: /srv/projects, users: [auth|owner] }\n';

      expect(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml)).toThrow(
        ConfigurationError,
      );
    });

    it('refuses a file it cannot read, without quoting the system error', () => {
      const problems = problemsOf(() =>
        loadWorkspaceAllowlist('/nowhere.yaml', fakeFs(VALID), parseYaml),
      );

      // Never the underlying message: it carries absolute server paths, and on some systems the
      // surrounding directory listing.
      expect(problems).toEqual(['/nowhere.yaml: the workspace allowlist cannot be read']);
    });

    it('refuses a file that is not a YAML document', () => {
      const problems = problemsOf(() =>
        loadWorkspaceAllowlist(FILE, fakeFs('roots: [\n  - unterminated'), parseYaml),
      );

      expect(problems[0]).toContain('not a valid YAML document');
    });

    it('names the file and the entry, so the message is actionable', () => {
      const text = 'roots:\n  - { path: projects, label: A, users: [auth|owner] }\n';

      expect(problemsOf(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml))[0]).toContain(
        `${FILE}: roots[0].path`,
      );
    });

    it('reports every bad root at once, not one boot attempt per mistake', () => {
      const text = `
roots:
  - { path: relative, label: A, users: [auth|owner] }
  - { path: /srv/gone, label: B, users: [auth|owner] }
`;

      expect(problemsOf(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml))).toHaveLength(
        2,
      );
    });

    it('reports every schema problem at once as well', () => {
      const text = 'roots:\n  - { path: /srv/projects }\n';

      expect(
        problemsOf(() => loadWorkspaceAllowlist(FILE, fakeFs(text), parseYaml)).length,
      ).toBeGreaterThan(1);
    });
  });

  it('stores the resolved root, so a root that is itself a symlink still contains things', () => {
    // Resolving only the candidate and not the root would make such a root contain nothing: every
    // comparison would be a resolved path against an unresolved one.
    const text = 'roots:\n  - { path: /srv/link, label: A, users: [auth|owner] }\n';
    const fs = fakeFs(text, ['/data/projects'], { '/srv/link': '/data/projects' });

    expect(loadWorkspaceAllowlist(FILE, fs, parseYaml)[0]?.root.value).toBe('/data/projects');
  });
});
