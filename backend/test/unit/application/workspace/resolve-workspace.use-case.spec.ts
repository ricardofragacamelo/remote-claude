import { beforeEach, describe, expect, it } from 'vitest';

import { ResolveWorkspaceUseCase } from '@application/workspace';
import type { WorkspaceDirectoryProbe } from '@application/workspace';
import { UserId } from '@domain/auth';
import {
  InvalidWorkspacePathError,
  WorkspaceNotADirectoryError,
  WorkspaceNotAllowedError,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
} from '@domain/workspace';
import type { WorkspaceAllowlist } from '@domain/workspace';
import { anAllowlist, OWNER } from '../../../support/builders/workspace.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryWorkspaceUsageRepository } from '../../../support/fakes/in-memory-workspace-usage.repository';
import { StubDirectoryProbe } from '../../../support/fakes/stub-directory.probe';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');
const now = new Date('2026-09-18T10:00:00.000Z');

describe('ResolveWorkspaceUseCase', () => {
  let usage: InMemoryWorkspaceUsageRepository;
  let clock: FixedClock;

  beforeEach(() => {
    usage = new InMemoryWorkspaceUsageRepository();
    clock = new FixedClock(now);
  });

  const build = (
    probe: WorkspaceDirectoryProbe,
    allowlist: WorkspaceAllowlist = anAllowlist(),
  ): ResolveWorkspaceUseCase =>
    new ResolveWorkspaceUseCase({ current: () => allowlist }, probe, usage, clock);

  const inside = (): StubDirectoryProbe => StubDirectoryProbe.directories('/srv/projects/app');

  it('accepts a directory inside an allowed root — S-09', async () => {
    const { path, workspace } = await build(inside()).execute('/srv/projects/app', owner);

    expect(path.value).toBe('/srv/projects/app');
    expect(workspace.label).toBe('Projects');
  });

  it('accepts the root itself — S-16', async () => {
    const resolved = await build(StubDirectoryProbe.directories('/srv/projects')).execute(
      '/srv/projects',
      owner,
    );

    expect(resolved.path.value).toBe('/srv/projects');
  });

  describe('the pure rule runs first, and costs no I/O', () => {
    it('refuses a relative path without touching the disk — S-13', async () => {
      const probe = inside();

      await expect(build(probe).execute('projects/app', owner)).rejects.toThrow(
        InvalidWorkspacePathError,
      );
      expect(probe.asked).toEqual([]);
    });

    it('refuses a path outside every root without touching the disk — S-10', async () => {
      const probe = inside();

      await expect(build(probe).execute('/etc/passwd', owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
      expect(probe.asked).toEqual([]);
    });

    it('refuses a `..` that escapes the root — S-11', async () => {
      await expect(build(inside()).execute('/srv/projects/../../etc', owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('refuses a textual prefix of the root — S-17', async () => {
      await expect(build(inside()).execute('/srv/projects-evil', owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('refuses a root that is somebody else’s, as forbidden — D-17', async () => {
      await expect(build(inside()).execute('/srv/projects/app', stranger)).rejects.toThrow(
        WorkspaceForbiddenError,
      );
    });
  });

  describe('then the disk', () => {
    it('refuses a path that is not there — S-15', async () => {
      await expect(
        build(new StubDirectoryProbe()).execute('/srv/projects/gone', owner),
      ).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('refuses a path that is a file — S-14', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/readme.md': {
          kind: 'present',
          realPath: '/srv/projects/readme.md',
          isDirectory: false,
        },
      });

      await expect(build(probe).execute('/srv/projects/readme.md', owner)).rejects.toThrow(
        WorkspaceNotADirectoryError,
      );
    });

    it('refuses a symlink inside the root that points outside it — S-12', async () => {
      // It clears the pure rule by its name and fails here by its target. Checking the name alone
      // is the classic way past a path check.
      const probe = new StubDirectoryProbe({
        '/srv/projects/escape': { kind: 'present', realPath: '/etc', isDirectory: true },
      });

      await expect(build(probe).execute('/srv/projects/escape', owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('accepts a symlink that resolves back inside the root', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/link': {
          kind: 'present',
          realPath: '/srv/projects/real',
          isDirectory: true,
        },
      });

      expect((await build(probe).execute('/srv/projects/link', owner)).path.value).toBe(
        '/srv/projects/real',
      );
    });

    it('answers "not allowed" and not "not a directory" for a link escaping to a file', async () => {
      // Order matters: `422` there would confirm that something exists outside the allowlist.
      const probe = new StubDirectoryProbe({
        '/srv/projects/escape': { kind: 'present', realPath: '/etc/passwd', isDirectory: false },
      });

      await expect(build(probe).execute('/srv/projects/escape', owner)).rejects.toThrow(
        WorkspaceNotAllowedError,
      );
    });

    it('hands on the real path, never the name that was typed', async () => {
      const probe = new StubDirectoryProbe({
        '/srv/projects/link': {
          kind: 'present',
          realPath: '/srv/projects/real',
          isDirectory: true,
        },
      });

      // Whoever opens it later would otherwise follow a link that could be repointed in between.
      expect((await build(probe).execute('/srv/projects/link', owner)).path.value).toBe(
        '/srv/projects/real',
      );
    });

    it('lets a failure to look propagate instead of calling it "not found"', async () => {
      const probe: WorkspaceDirectoryProbe = {
        inspect: () => Promise.reject(new Error('EACCES')),
      };

      await expect(build(probe).execute('/srv/projects/app', owner)).rejects.toThrow('EACCES');
    });
  });

  describe('the usage record', () => {
    it('is not written by a plain check', async () => {
      await build(inside()).execute('/srv/projects/app', owner);

      expect(usage.rows.size).toBe(0);
    });

    it('is written when the caller asks for it', async () => {
      await build(inside()).execute('/srv/projects/app', owner, { recordUse: true });

      expect(await usage.findByUser(owner)).toMatchObject([{ label: 'Projects', lastUsedAt: now }]);
    });

    it('records the root, not the path underneath it', async () => {
      await build(inside()).execute('/srv/projects/app', owner, { recordUse: true });

      expect((await usage.findByUser(owner))[0]?.root.value).toBe('/srv/projects');
    });

    it('takes the instant from the clock, never from the wall', async () => {
      clock.set(new Date('2026-09-19T08:00:00.000Z'));
      await build(inside()).execute('/srv/projects/app', owner, { recordUse: true });

      expect((await usage.findByUser(owner))[0]?.lastUsedAt).toEqual(
        new Date('2026-09-19T08:00:00.000Z'),
      );
    });

    it('does not duplicate the record for a second use of the same root — S-20', async () => {
      const resolve = build(inside());

      await resolve.execute('/srv/projects/app', owner, { recordUse: true });
      clock.set(new Date('2026-09-19T08:00:00.000Z'));
      await resolve.execute('/srv/projects/app', owner, { recordUse: true });

      expect(usage.rows.size).toBe(1);
      expect((await usage.findByUser(owner))[0]?.lastUsedAt).toEqual(
        new Date('2026-09-19T08:00:00.000Z'),
      );
    });

    it('is never written for a path that was refused', async () => {
      await expect(build(inside()).execute('/etc', owner, { recordUse: true })).rejects.toThrow(
        WorkspaceNotAllowedError,
      );

      expect(usage.rows.size).toBe(0);
    });
  });

  it('reads the allowlist on every call, so a reload takes effect without a restart', async () => {
    let allowlist = anAllowlist();
    const resolve = new ResolveWorkspaceUseCase(
      { current: () => allowlist },
      inside(),
      usage,
      clock,
    );

    await expect(resolve.execute('/srv/projects/app', owner)).resolves.toBeDefined();

    allowlist = anAllowlist([]);

    await expect(resolve.execute('/srv/projects/app', owner)).rejects.toThrow(
      WorkspaceNotAllowedError,
    );
  });
});
