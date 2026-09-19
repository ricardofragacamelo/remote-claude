import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import { aWorkspace, OWNER } from '../../../../support/builders/workspace.builder';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');

describe('Workspace', () => {
  it('allows a subject the file listed for it', () => {
    expect(aWorkspace().allows(owner)).toBe(true);
  });

  it('does not allow a subject the file did not list', () => {
    // An allowlist that is global stops being one the moment a second person signs in — D-13.
    expect(aWorkspace().allows(stranger)).toBe(false);
  });

  it('allows every subject the file listed, not only the first', () => {
    const shared = aWorkspace({ users: ['auth|a', OWNER] });

    expect(shared.allows(owner)).toBe(true);
    expect(shared.allows(UserId.create('auth|a'))).toBe(true);
  });

  it('contains a path underneath its root', () => {
    expect(aWorkspace().contains(WorkspacePath.create('/srv/projects/app'))).toBe(true);
  });

  it('does not contain a path outside its root', () => {
    expect(aWorkspace().contains(WorkspacePath.create('/srv/projects-evil'))).toBe(false);
  });

  it('starts with no usage history', () => {
    expect(aWorkspace().lastUsedAt).toBeNull();
  });

  it('carries the instant it was last used, without losing anything else', () => {
    const at = new Date('2026-09-18T10:00:00.000Z');
    const used = aWorkspace().usedAt(at);

    expect(used.lastUsedAt).toEqual(at);
    expect(used.label).toBe('Projects');
    expect(used.root.value).toBe('/srv/projects');
    expect(used.allows(owner)).toBe(true);
  });

  it('can be told it was never used, which is not the same as not knowing', () => {
    expect(aWorkspace().usedAt(new Date()).usedAt(null).lastUsedAt).toBeNull();
  });

  it('copies the list of users, so the caller cannot widen it afterwards', () => {
    const users = ['auth|a'];
    const workspace = aWorkspace({ users });

    users.push('auth|intruder');

    expect(workspace.allows(UserId.create('auth|intruder'))).toBe(false);
  });
});
