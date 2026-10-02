import { describe, expect, it } from 'vitest';

import { UserId } from '@domain/auth';
import { liveSessionsIn } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { aSession } from '../../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const folder = (path: string): WorkspacePath => WorkspacePath.create(path);

/** The ids a listing answers, in order. */
const ids = (sessions: ReturnType<typeof liveSessionsIn>): string[] =>
  sessions.map((session) => session.id.value);

/** Which live sessions a folder shows — plan 08, B-07. The fences are pure: owner and containment. */
describe('liveSessionsIn', () => {
  const inRepo = aSession({ id: '01J0AAAAAAAAAAAAAAAAAAAAAA', workspace: '/srv/repo' });
  const inApp = aSession({ id: '01J0BBBBBBBBBBBBBBBBBBBBBB', workspace: '/srv/repo/app' });
  const inOld = aSession({ id: '01J0CCCCCCCCCCCCCCCCCCCCCC', workspace: '/srv/repo-old' });

  it('lists the sessions of the folder and of every folder below it — S-13', () => {
    expect(ids(liveSessionsIn(folder('/srv/repo'), [inRepo, inApp, inOld], owner))).toEqual(
      expect.arrayContaining([inRepo.id.value, inApp.id.value]),
    );
  });

  it('leaves out a session of somebody else in the same folder — S-14', () => {
    const theirs = aSession({
      id: '01J0DDDDDDDDDDDDDDDDDDDDDD',
      ownerId: 'auth|other',
      workspace: '/srv/repo',
    });

    expect(ids(liveSessionsIn(folder('/srv/repo'), [theirs], owner))).toEqual([]);
  });

  it('does not list a session of the parent folder in a child — S-15', () => {
    expect(ids(liveSessionsIn(folder('/srv/repo/app'), [inRepo, inApp], owner))).toEqual([
      inApp.id.value,
    ]);
  });

  it('does not take a textual prefix for a folder: /srv/repo-old is not in /srv/repo — S-16', () => {
    expect(ids(liveSessionsIn(folder('/srv/repo'), [inOld], owner))).toEqual([]);
  });

  it('answers nothing for a folder with no live session — S-17', () => {
    expect(liveSessionsIn(folder('/srv/elsewhere'), [inRepo, inApp], owner)).toEqual([]);
  });

  it('leaves out a session that has closed, whatever still holds it — S-22', () => {
    const closed = aSession({ id: '01J0EEEEEEEEEEEEEEEEEEEEEE', workspace: '/srv/repo' });
    closed.close('closedByUser');

    expect(ids(liveSessionsIn(folder('/srv/repo'), [closed, inRepo], owner))).toEqual([
      inRepo.id.value,
    ]);
  });

  it('lists the most recently opened first, and orders a tie the same way every time', () => {
    const at = new Date('2026-10-01T10:00:00.000Z');
    const later = aSession({
      id: '01J0FFFFFFFFFFFFFFFFFFFFFF',
      workspace: '/srv/repo',
      openedAt: new Date('2026-10-01T11:00:00.000Z'),
    });
    const first = aSession({
      id: '01J0GGGGGGGGGGGGGGGGGGGGGG',
      workspace: '/srv/repo',
      openedAt: at,
    });
    const second = aSession({
      id: '01J0HHHHHHHHHHHHHHHHHHHHHH',
      workspace: '/srv/repo',
      openedAt: at,
    });

    expect(ids(liveSessionsIn(folder('/srv/repo'), [second, first, later], owner))).toEqual([
      later.id.value,
      first.id.value,
      second.id.value,
    ]);
    expect(ids(liveSessionsIn(folder('/srv/repo'), [first, second], owner))).toEqual([
      first.id.value,
      second.id.value,
    ]);
  });
});
