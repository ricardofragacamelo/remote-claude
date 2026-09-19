import { beforeEach, describe, expect, it } from 'vitest';

import { ListWorkspacesUseCase } from '@application/workspace';
import { UserId } from '@domain/auth';
import { WorkspacePath, WorkspaceUsage } from '@domain/workspace';
import type { WorkspaceAllowlist } from '@domain/workspace';
import { anAllowlist, aWorkspace, OWNER } from '../../../support/builders/workspace.builder';
import { InMemoryWorkspaceUsageRepository } from '../../../support/fakes/in-memory-workspace-usage.repository';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

describe('ListWorkspacesUseCase', () => {
  let usage: InMemoryWorkspaceUsageRepository;

  beforeEach(() => {
    usage = new InMemoryWorkspaceUsageRepository();
  });

  const build = (allowlist: WorkspaceAllowlist): ListWorkspacesUseCase =>
    new ListWorkspacesUseCase({ current: () => allowlist }, usage);

  it('lists the configured roots of this user — S-19', async () => {
    expect(await build(anAllowlist()).execute(owner)).toMatchObject([{ label: 'Projects' }]);
  });

  it('never lists a root that belongs to somebody else', async () => {
    const allowlist = anAllowlist([
      aWorkspace({ root: '/srv/mine', label: 'Mine' }),
      aWorkspace({ root: '/srv/theirs', label: 'Theirs', users: ['auth|stranger'] }),
    ]);

    expect((await build(allowlist).execute(owner)).map((w) => w.label)).toEqual(['Mine']);
  });

  it('answers an empty list rather than an error for a user with no roots', async () => {
    // Empty is a state the screen has to handle anyway, and an error here would make "you have no
    // workspaces yet" look like a failure.
    expect(await build(anAllowlist()).execute(stranger)).toEqual([]);
  });

  it('attaches the instant each root was last used', async () => {
    const at = new Date('2026-09-18T10:00:00.000Z');
    await usage.record(
      WorkspaceUsage.record(owner, WorkspacePath.create('/srv/projects'), 'Projects', at),
    );

    expect((await build(anAllowlist()).execute(owner))[0]?.lastUsedAt).toEqual(at);
  });

  it('leaves a never-opened root without an instant', async () => {
    expect((await build(anAllowlist()).execute(owner))[0]?.lastUsedAt).toBeNull();
  });

  it('does not attach another user’s usage to this user’s root', async () => {
    const shared = aWorkspace({ users: [OWNER, 'auth|stranger'] });
    await usage.record(
      WorkspaceUsage.record(
        stranger,
        WorkspacePath.create('/srv/projects'),
        'Projects',
        new Date(),
      ),
    );

    expect((await build(anAllowlist([shared])).execute(owner))[0]?.lastUsedAt).toBeNull();
  });

  it('ignores a stored row whose root the allowlist no longer declares', async () => {
    // The file is the source of truth. A root removed from it disappears from the listing on the
    // next reload, even though the metadata row survives.
    await usage.record(
      WorkspaceUsage.record(owner, WorkspacePath.create('/srv/removed'), 'Removed', new Date()),
    );

    expect((await build(anAllowlist()).execute(owner)).map((w) => w.root.value)).toEqual([
      '/srv/projects',
    ]);
  });

  it('reads the allowlist on every call, so a reload is visible without a restart', async () => {
    let allowlist = anAllowlist();
    const listed = new ListWorkspacesUseCase({ current: () => allowlist }, usage);

    expect(await listed.execute(owner)).toHaveLength(1);

    allowlist = anAllowlist([]);

    expect(await listed.execute(owner)).toHaveLength(0);
  });
});
