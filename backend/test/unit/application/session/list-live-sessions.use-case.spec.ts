import { describe, expect, it } from 'vitest';

import { ListLiveSessionsUseCase, SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import type { SessionId } from '@domain/session';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import {
  aConversation,
  aSession,
  RecordingHandle,
} from '../../../support/builders/session.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';

const owner = UserId.create('auth|owner');

/** A locator that resolves every path to itself, or refuses one the test names. */
function locator(refused: string | null = null) {
  const asked: string[] = [];

  return {
    asked,
    locate: (raw: string) => {
      asked.push(raw);
      return raw === refused
        ? Promise.reject(new WorkspaceNotAllowedError(raw))
        : Promise.resolve(WorkspacePath.create(raw));
    },
  };
}

/** Pending questions by session, as the permission registry would count them. */
const pending = (counts: Record<string, number> = {}) => ({
  countFor: (id: SessionId) => counts[id.value] ?? 0,
});

/** The live sessions of a folder, over the registry — plan 08, B-07. */
describe('ListLiveSessionsUseCase', () => {
  const registry = (): SessionRegistry => new SessionRegistry(10, new FixedClock(new Date()));

  it('lists each session with its conversation and how many questions it holds — S-13', async () => {
    const live = registry();
    const session = aSession({ workspace: '/srv/repo/app', openedFrom: 'mobile' });
    live.add({ session, handle: new RecordingHandle(), conversation: aConversation() });

    const listed = await new ListLiveSessionsUseCase(
      locator(),
      live,
      pending({ [session.id.value]: 2 }),
    ).execute('/srv/repo', owner);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      session,
      conversation: aConversation(),
      pendingPermissions: 2,
    });
    expect(listed[0]?.session.openedFrom).toBe('mobile');
  });

  it('lists a session that is still starting, once, with its conversation — S-23', async () => {
    const live = registry();
    const starting = aSession({ workspace: '/srv/repo' });
    live.announce(starting, aConversation());

    const useCase = new ListLiveSessionsUseCase(locator(), live, pending());
    const before = await useCase.execute('/srv/repo', owner);

    expect(before.map((entry) => entry.session.status)).toEqual(['starting']);
    expect(before[0]?.conversation).toEqual(aConversation());

    live.add({ session: starting, handle: new RecordingHandle(), conversation: aConversation() });

    expect(await useCase.execute('/srv/repo', owner)).toHaveLength(1);
  });

  it('forgets a start that never became a session — S-23', async () => {
    const live = registry();
    const failed = aSession({ workspace: '/srv/repo' });
    live.announce(failed, aConversation());
    live.withdraw(failed.id);

    expect(
      await new ListLiveSessionsUseCase(locator(), live, pending()).execute('/srv/repo', owner),
    ).toEqual([]);
  });

  it('asks the gate about the folder before the registry is looked at — S-19', async () => {
    const gate = locator('/etc');

    await expect(
      new ListLiveSessionsUseCase(gate, registry(), pending()).execute('/etc', owner),
    ).rejects.toThrow(WorkspaceNotAllowedError);
    expect(gate.asked).toEqual(['/etc']);
  });
});
