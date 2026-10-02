import { beforeEach, describe, expect, it } from 'vitest';

import { ListTranscriptsUseCase, TranscriptAudience } from '@application/transcript';
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
import { FixedClock } from '../../../support/fakes/fixed-clock';

/** The backend's clock in these tests: one minute after the default `lastModified` of a session. */
const NOW = new Date(1_758_800_000_000 + 60_000);

/** The window of "active elsewhere" these tests run with: the default of the installation. */
const WINDOW_MS = 120_000;

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

  /** Which conversations are live for whom: `conversationId → { userId → sessionId }`. */
  let live: Map<string, Map<string, string>>;

  beforeEach(() => {
    live = new Map();
  });

  const listWith = (options: {
    readonly workspacePath?: string;
    readonly as?: UserId;
    readonly includeSubfolders?: boolean;
  }) =>
    new ListTranscriptsUseCase(
      { current: () => allowlist },
      store,
      new TranscriptAudience(
        { current: () => allowlist },
        origins,
        {
          liveSessionOf: (conversation, userId) =>
            live.get(conversation.value)?.get(userId.value) ?? null,
        },
        { clock: new FixedClock(NOW), activeWindowMs: WINDOW_MS },
      ),
    ).execute({
      userId: options.as ?? owner,
      workspacePath: options.workspacePath ?? '/srv/projects/app',
      includeSubfolders: options.includeSubfolders ?? false,
      after: null,
      limit: 25,
    });

  const list = (workspacePath = '/srv/projects/app', as = owner) => listWith({ workspacePath, as });

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

  /** Plan 08, B-08 — what each conversation is doing, and the folders below. */
  describe('the activity of each conversation', () => {
    const activities = async (options: Parameters<typeof listWith>[0] = {}) =>
      (await listWith(options)).items.map(({ id, activity }) => [id.value, activity.activity]);

    it('says which are live here, active elsewhere or idle — S-25', async () => {
      store
        .add('/srv/projects/app', aTranscriptSession({ id: 1 }))
        .add(
          '/srv/projects/app',
          aTranscriptSession({ id: 2, lastModified: 1_758_800_000_000 - 1 }),
        )
        .add(
          '/srv/projects/app',
          aTranscriptSession({ id: 3, lastModified: NOW.getTime() - 600_000 }),
        );
      await openedHere(1, owner);
      live.set(conversationId(1), new Map([[OWNER, '01J0LIVE0000000000000000000']]));

      const page = await listWith({});

      expect(page.items.map(({ id, activity }) => [id.value, activity])).toEqual([
        [
          conversationId(1),
          {
            activity: 'liveHere',
            liveSessionId: '01J0LIVE0000000000000000000',
            writtenAgoSeconds: 60,
          },
        ],
        [
          conversationId(2),
          { activity: 'activeElsewhere', liveSessionId: null, writtenAgoSeconds: 60 },
        ],
        [conversationId(3), { activity: 'idle', liveSessionId: null, writtenAgoSeconds: 600 }],
      ]);
    });

    it('takes the window inclusively: at its edge active, a millisecond past it idle — S-26', async () => {
      store
        .add(
          '/srv/projects/app',
          aTranscriptSession({ id: 1, lastModified: NOW.getTime() - WINDOW_MS }),
        )
        .add(
          '/srv/projects/app',
          aTranscriptSession({ id: 2, lastModified: NOW.getTime() - WINDOW_MS - 1 }),
        );

      expect(await activities()).toEqual([
        [conversationId(1), 'activeElsewhere'],
        [conversationId(2), 'idle'],
      ]);
    });

    it('reads a conversation written in the future, by a clock ahead of ours, as written now', async () => {
      store.add(
        '/srv/projects/app',
        aTranscriptSession({ id: 1, lastModified: NOW.getTime() + 5_000 }),
      );

      expect((await listWith({})).items[0]?.activity).toEqual({
        activity: 'activeElsewhere',
        liveSessionId: null,
        writtenAgoSeconds: 0,
      });
    });

    it('labels live only the caller’s own session — S-27', async () => {
      store.add('/srv/projects/app', aTranscriptSession({ id: 1 }));
      live.set(conversationId(1), new Map([['auth|stranger', '01J0THEIRS00000000000000000']]));

      expect(await activities()).toEqual([[conversationId(1), 'activeElsewhere']]);
    });

    it('never reads one of ours as active elsewhere, however recent — S-28', async () => {
      store.add('/srv/projects/app', aTranscriptSession({ id: 1, lastModified: NOW.getTime() }));
      await openedHere(1, owner);

      expect(await activities()).toEqual([[conversationId(1), 'idle']]);
    });

    it('with the subfolders, lists what ran inside the folder from the whole store — D-05', async () => {
      store
        .add('/srv/projects/app', aTranscriptSession({ id: 1, cwd: '/srv/projects/app' }))
        .add(
          '/srv/projects/app/backend',
          aTranscriptSession({ id: 2, cwd: '/srv/projects/app/backend' }),
        )
        .add('/srv/projects/app-old', aTranscriptSession({ id: 3, cwd: '/srv/projects/app-old' }))
        .add('/srv/projects', aTranscriptSession({ id: 4, cwd: '/srv/projects' }));

      const page = await listWith({ includeSubfolders: true });

      expect(page.items.map(({ id }) => id.value).sort()).toEqual(
        [conversationId(1), conversationId(2)].sort(),
      );
      expect(store.wholeListings).toBe(1);
      expect(store.listed).toEqual([]);
    });

    it('without them, asks the store for the folder alone, never the whole store', async () => {
      store.add(
        '/srv/projects/app/backend',
        aTranscriptSession({ id: 2, cwd: '/srv/projects/app/backend' }),
      );

      expect((await listWith({})).items).toEqual([]);
      expect(store.wholeListings).toBe(0);
    });

    it('leaves out what a subfolder that is a link out of the root ran — S-29', async () => {
      // The CLI records the real path its process had: through a link to /srv/elsewhere, the cwd is
      // /srv/elsewhere, which is neither inside the folder nor in a root of the caller.
      store.add('/srv/elsewhere', aTranscriptSession({ id: 1, cwd: '/srv/elsewhere' }));

      expect((await listWith({ includeSubfolders: true })).items).toEqual([]);
    });

    it('leaves out a session with no working directory from the whole store too', async () => {
      store.add('/srv/projects/app', aTranscriptSession({ id: 1, cwd: null }));

      expect((await listWith({ includeSubfolders: true })).items).toEqual([]);
    });
  });
});
