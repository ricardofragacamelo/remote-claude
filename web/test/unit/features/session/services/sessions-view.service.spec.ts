import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  arrangeConversations,
  arrangeLiveSessions,
  fetchFolderConversations,
  fetchLiveSessions,
  matchesConversation,
} from '@/features/session/services/sessions-view.service';
import type { ConversationSummary } from '@/features/session';
import { api } from '@/shared/api/api';
import { aConversationDto, EDITOR, OURS, WORKSPACE } from '../../../../support/history';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A live session as `GET /sessions` describes it. */
function aLiveDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: '01J0LIVE0000000000000000AA',
    claudeSessionId: OURS,
    resumedFrom: null,
    workspacePath: WORKSPACE,
    status: 'idle',
    model: 'claude-sonnet-5',
    permissionMode: 'default',
    startedAt: '2026-10-01T10:00:00.000Z',
    openedFrom: 'web',
    pendingPermissions: 0,
    ...overrides,
  };
}

/** A conversation as the screen reads it. */
function aSummary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    conversationId: OURS,
    summary: 'Fix the flaky test',
    origin: 'ours',
    cwd: WORKSPACE,
    gitBranch: null,
    lastModified: '2026-10-01T10:00:00.000Z',
    activity: 'idle',
    liveSessionId: null,
    writtenAgoSeconds: 60,
    ...overrides,
  };
}

describe('fetchLiveSessions — plan 08, B-07', () => {
  it('asks for the live sessions of one folder', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [] });

    await fetchLiveSessions(WORKSPACE);

    expect(get).toHaveBeenCalledWith('/sessions?workspacePath=%2Fsrv%2Fprojects%2Fapp');
  });

  it('reads each session, and what the backend left out as its default', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      sessions: [
        aLiveDto({ openedFrom: 'mobile', pendingPermissions: 2, status: 'waitingPermission' }),
        aLiveDto({
          sessionId: '01J0LIVE0000000000000000BB',
          status: 'dreaming',
          model: 7,
          openedFrom: 'tv',
          pendingPermissions: 'x',
          startedAt: null,
          permissionMode: null,
        }),
      ],
    });

    const [first, second] = await fetchLiveSessions(WORKSPACE);

    expect(first).toMatchObject({
      openedFrom: 'mobile',
      pendingPermissions: 2,
      status: 'waitingPermission',
    });
    expect(second).toMatchObject({
      status: 'idle',
      model: '',
      openedFrom: 'web',
      pendingPermissions: 0,
      startedAt: '',
      permissionMode: '',
    });
  });

  it.each(['sessionId', 'claudeSessionId', 'workspacePath', 'status'])(
    'drops a row without %s, and an answer without a list is an empty one',
    async (field) => {
      vi.spyOn(api, 'get')
        .mockResolvedValueOnce({ sessions: [aLiveDto({ [field]: null }), 'nope'] })
        .mockResolvedValueOnce({});

      expect(await fetchLiveSessions(WORKSPACE)).toEqual([]);
      expect(await fetchLiveSessions(WORKSPACE)).toEqual([]);
    },
  );
});

describe('fetchFolderConversations — plan 08, B-08', () => {
  it('asks for one folder, exactly, by default', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });

    await fetchFolderConversations(WORKSPACE, null, false);

    expect(get).toHaveBeenCalledWith('/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp');
  });

  it('asks for the folders below, and the next page by its cursor, when told', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ sessions: [], nextCursor: null });

    await fetchFolderConversations(WORKSPACE, 'c1', true);

    expect(get).toHaveBeenCalledWith(
      '/transcripts?workspacePath=%2Fsrv%2Fprojects%2Fapp&includeSubfolders=true&cursor=c1',
    );
  });

  it('reads each conversation with what it is doing, and drops what it cannot read', async () => {
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({
        sessions: [
          aConversationDto({
            activity: 'activeElsewhere',
            writtenAgoSeconds: 30,
            origin: 'external',
            sessionId: EDITOR,
          }),
          { sessionId: 3 },
        ],
        nextCursor: 'n',
      })
      .mockResolvedValueOnce({});

    expect(await fetchFolderConversations(WORKSPACE, null, false)).toMatchObject({
      conversations: [
        { conversationId: EDITOR, activity: 'activeElsewhere', writtenAgoSeconds: 30 },
      ],
      nextCursor: 'n',
    });
    expect(await fetchFolderConversations(WORKSPACE, null, false)).toEqual({
      conversations: [],
      nextCursor: null,
    });
  });
});

describe('narrowing and ordering the rows — S-36, S-50', () => {
  const filter = { search: '', origin: 'all', sort: 'recent' } as const;

  it('matches the title whatever the case and the accents', () => {
    const row = aSummary({ summary: 'Revisão da Configuração' });

    expect(matchesConversation(row, { ...filter, search: '  configuracao ' })).toBe(true);
    expect(matchesConversation(row, { ...filter, search: 'deploy' })).toBe(false);
  });

  it('keeps only the origin asked for', () => {
    const rows = [aSummary(), aSummary({ conversationId: EDITOR, origin: 'external' })];

    expect(
      arrangeConversations(rows, { ...filter, origin: 'external' }).map((row) => row.origin),
    ).toEqual(['external']);
  });

  it('keeps each conversation once, the newest copy of it — S-50', () => {
    const rows = [aSummary({ summary: 'old title' }), aSummary({ summary: 'new title' })];

    expect(arrangeConversations(rows, filter).map((row) => row.summary)).toEqual(['new title']);
  });

  it('orders by the latest write, or by name', () => {
    const rows = [
      aSummary({ conversationId: 'a', summary: 'Beta', lastModified: '2026-10-01T09:00:00.000Z' }),
      aSummary({ conversationId: 'b', summary: 'Alpha', lastModified: '2026-10-01T11:00:00.000Z' }),
    ];

    expect(arrangeConversations(rows, filter).map((row) => row.conversationId)).toEqual(['b', 'a']);
    expect(
      arrangeConversations(rows, { ...filter, sort: 'name' }).map((row) => row.summary),
    ).toEqual(['Alpha', 'Beta']);
  });

  it('narrows and orders the live sessions by the title of their conversation', () => {
    const sessions = [
      { ...aLiveDto({ sessionId: 's1', startedAt: '2026-10-01T09:00:00.000Z' }) },
      { ...aLiveDto({ sessionId: 's2', startedAt: '2026-10-01T10:00:00.000Z' }) },
    ] as never[];
    const titles: Record<string, string> = { s1: 'Zeta work', s2: 'Alpha work' };
    const titleOf = (session: { sessionId: string }) => titles[session.sessionId] ?? '';

    expect(
      arrangeLiveSessions(sessions, filter, titleOf).map((s: { sessionId: string }) => s.sessionId),
    ).toEqual(['s2', 's1']);
    expect(
      arrangeLiveSessions(sessions, { ...filter, sort: 'name' }, titleOf).map(
        (s: { sessionId: string }) => s.sessionId,
      ),
    ).toEqual(['s2', 's1']);
    expect(arrangeLiveSessions(sessions, { ...filter, search: 'zeta' }, titleOf)).toHaveLength(1);
  });
});
