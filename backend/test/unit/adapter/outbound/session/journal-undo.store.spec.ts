import { describe, expect, it } from 'vitest';

import type { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { JournalUndoStore } from '@adapter/outbound/session/journal-undo.store';
import { SessionFileState, SessionId } from '@domain/session';
import { ClaudeSessionId } from '@domain/transcript';
import { CONVERSATION_ID, SESSION_ID } from '../../../../support/builders/session.builder';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const reach = {
  sessionId: SessionId.create(SESSION_ID),
  claudeSessionId: ClaudeSessionId.create(CONVERSATION_ID),
};

const state = SessionFileState.record({
  ...reach,
  path: '/srv/a.md',
  hash: null,
  mtime: new Date('2026-09-26T12:00:00.000Z'),
  sizeBytes: 0,
  updatedAt: new Date('2026-09-26T12:00:00.000Z'),
});

/** A repository whose methods answer what the test says, and remember what they were asked. */
function aRepository(saveState: () => Promise<void> = () => Promise.resolve()) {
  const asked: string[] = [];
  const files = {
    checkpointsOfConversation: (sessionId: SessionId, conversation: ClaudeSessionId) => {
      asked.push(`checkpoints ${sessionId.value} ${conversation.value}`);
      return Promise.resolve([]);
    },
    statesOfConversation: (sessionId: SessionId, conversation: ClaudeSessionId) => {
      asked.push(`states ${sessionId.value} ${conversation.value}`);
      return Promise.resolve([]);
    },
    sessionsOfConversations: (conversations: readonly string[]) => {
      asked.push(`sessions ${conversations.join(',')}`);
      return Promise.resolve(['01J0ABCDEFGHJKMNPQRSTVWXY0']);
    },
    saveState,
  } as unknown as DrizzleSessionFileRepository;

  return { files, asked };
}

describe('JournalUndoStore', () => {
  it('reads by the live session and the conversation it is — S-59', async () => {
    const { files, asked } = aRepository();
    const store = new JournalUndoStore(files, new RecordingLogger().logger);

    await store.checkpointsOf(reach);
    await store.baselinesOf(reach);

    expect(asked).toEqual([
      `checkpoints ${SESSION_ID} ${CONVERSATION_ID}`,
      `states ${SESSION_ID} ${CONVERSATION_ID}`,
    ]);
  });

  it('keeps for a purge the live sessions and the earlier ones of their conversations — S-67', async () => {
    const { files } = aRepository();
    const store = new JournalUndoStore(files, new RecordingLogger().logger);

    expect([...(await store.reachOf([reach]))]).toEqual([SESSION_ID, '01J0ABCDEFGHJKMNPQRSTVWXY0']);
  });

  it('writes the baseline an undo left', async () => {
    const saved: SessionFileState[] = [];
    const { files } = aRepository((...args: unknown[]) => {
      saved.push(args[0] as SessionFileState);
      return Promise.resolve();
    });

    await new JournalUndoStore(files, new RecordingLogger().logger).recordBaseline(state);

    expect(saved).toEqual([state]);
  });

  it('never fails an undo over a baseline it could not write, and says so', async () => {
    const log = new RecordingLogger();
    const { files } = aRepository(() => Promise.reject(new Error('the database is gone')));

    await expect(new JournalUndoStore(files, log.logger).recordBaseline(state)).resolves.toBe(
      undefined,
    );
    expect(log.withOp('sessionFile.journal')[0]).toMatchObject({
      level: 'warn',
      path: '/srv/a.md',
    });
  });
});
