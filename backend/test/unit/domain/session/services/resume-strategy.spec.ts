import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { resumeStrategyFor } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';

const owner = UserId.create('auth|owner');
const caller = { userId: owner, workspace: WorkspacePath.create('/srv/projects/app') };

describe('resumeStrategyFor — plan 04, D-04', () => {
  it('continues one of ours in place — S-59', () => {
    expect(resumeStrategyFor({ cwd: '/srv/projects/app', openedBy: owner }, caller)).toBe(
      'inPlace',
    );
  });

  it('forks one nobody opened here, never writing into it — S-58', () => {
    expect(resumeStrategyFor({ cwd: '/srv/projects/app', openedBy: undefined }, caller)).toBe(
      'fork',
    );
  });

  it("refuses somebody else's, as if it were not there", () => {
    const openedBy = UserId.create('auth|somebody-else');

    expect(resumeStrategyFor({ cwd: '/srv/projects/app', openedBy }, caller)).toBeNull();
  });

  it('refuses one that recorded no working directory — failing closed, as the listing does', () => {
    expect(resumeStrategyFor({ cwd: null, openedBy: owner }, caller)).toBeNull();
  });

  it.each([
    ['another workspace', '/srv/projects/other'],
    ['a directory inside the workspace', '/srv/projects/app/packages/web'],
    ['a parent of the workspace', '/srv/projects'],
  ])('refuses one that ran in %s', (_case, cwd) => {
    // `resume` finds the file by `cwd`; one that ran elsewhere is not this workspace's to continue.
    expect(resumeStrategyFor({ cwd, openedBy: owner }, caller)).toBeNull();
  });
});
