import { beforeEach, describe, expect, it } from 'vitest';

import { ListTranscriptsUseCase } from '@application/transcript';
import { UserId } from '@domain/auth';
import { ClaudeSessionId } from '@domain/transcript';
import { SessionId } from '@domain/session';
import {
  InvalidWorkspacePathError,
  WorkspaceForbiddenError,
  WorkspaceNotAllowedError,
  WorkspacePath,
} from '@domain/workspace';
import { anAllowlist, aWorkspace, OWNER } from '../../../support/builders/workspace.builder';
import { aTranscriptSession, conversationId } from '../../../support/builders/transcript.builder';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';

const owner = UserId.create(OWNER);
const stranger = UserId.create('auth|stranger');
const allowlist = anAllowlist([
  aWorkspace({ root: '/srv/projects' }),
  aWorkspace({ root: '/srv/theirs', label: 'Theirs', users: ['auth|stranger'] }),
]);

describe('ListTranscriptsUseCase', () => {
  let store: InMemoryTranscriptStore;
  let origins: InMemorySessionOriginRepository;

  beforeEach(() => {
    store = new InMemoryTranscriptStore();
    origins = new InMemorySessionOriginRepository();
  });

  const list = (workspacePath = '/srv/projects/app', as = owner) =>
    new ListTranscriptsUseCase({ current: () => allowlist }, store, origins).execute({
      userId: as,
      workspacePath,
      after: null,
      limit: 25,
    });

  const openedHere = async (n: number, by: UserId): Promise<void> => {
    await origins.record({
      claudeSessionId: ClaudeSessionId.create(conversationId(n)),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: by,
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date(0),
    });
  };

  it('lists ours and the ones begun elsewhere, each with its origin — S-01', async () => {
    store
      .add('/srv/projects/app', aTranscriptSession({ id: 1, lastModified: 2 }))
      .add('/srv/projects/app', aTranscriptSession({ id: 2, lastModified: 1 }));
    await openedHere(1, owner);

    const page = await list();

    expect(page.items.map(({ id, origin }) => [id.value, origin])).toEqual([
      [conversationId(1), 'ours'],
      [conversationId(2), 'external'],
    ]);
  });

  it('asks the store about the normalised directory, and only that one', async () => {
    await list('/srv/projects/app/../app');

    expect(store.listed).toEqual(['/srv/projects/app']);
  });

  it('leaves out a conversation with no working directory — S-54', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ cwd: null }));

    expect((await list()).items).toEqual([]);
  });

  it('leaves out one whose working directory is outside the caller`s roots — S-55', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ cwd: '/srv/elsewhere/app' }));

    expect((await list()).items).toEqual([]);
  });

  it('leaves out one another person opened here — S-04', async () => {
    store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));
    await openedHere(1, stranger);

    expect((await list()).items).toEqual([]);
  });

  it('answers an empty page for a workspace with no conversation', async () => {
    expect(await list()).toEqual({ items: [], next: null });
  });

  it.each([
    ['outside every root', '/etc', WorkspaceNotAllowedError],
    ['a root of somebody else', '/srv/theirs/app', WorkspaceForbiddenError],
    ['not an absolute path', 'relative', InvalidWorkspacePathError],
  ])('refuses a directory %s before asking the store — S-73', async (_case, path, error) => {
    await expect(list(path)).rejects.toThrow(error);
    expect(store.listed).toEqual([]);
  });
});
