import { describe, expect, it } from 'vitest';

import { RecordToolInvocationUseCase } from '@application/audit';
import type { AuditRepository } from '@application/audit';
import { SessionChangeMemory } from '@application/session';
import type { ToolInvocation } from '@application/session';
import type { AuditEntry } from '@domain/audit';
import { SessionId } from '@domain/session';
import { AuditToolInvocationRecorder } from '@adapter/outbound/session/audit-tool-invocation.recorder';
import { aRegistry, aSession, SESSION_ID } from '../../../../support/builders/session.builder';
import { RecordingBroadcaster } from '../../../../support/fakes/recording-broadcaster';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const FILE = '/srv/projects/app/a.ts';

/** A trail that keeps what it is given — or refuses, when told to. */
class Trail implements AuditRepository {
  readonly entries: AuditEntry[] = [];
  failing = false;

  append(entry: AuditEntry): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('the trail is down'));
    }
    this.entries.push(entry);
    return Promise.resolve();
  }
}

function anInvocation(overrides: Partial<ToolInvocation> = {}): ToolInvocation {
  return {
    sessionId: SessionId.create(SESSION_ID),
    toolUseId: 'toolu_1',
    toolName: 'Edit',
    input: { file_path: FILE, old_string: 'a', new_string: 'b' },
    promptId: 'p1',
    at: new Date('2026-10-02T10:00:00.000Z'),
    ...overrides,
  };
}

function setUp(sessions = [aSession()]) {
  const trail = new Trail();
  const memory = new SessionChangeMemory();
  const { registry } = aRegistry(sessions);
  const recorder = new AuditToolInvocationRecorder(
    new RecordToolInvocationUseCase(trail, new SequentialIds()),
    registry,
    new RecordingBroadcaster(),
    new RecordingLogger().logger,
    memory,
  );

  return { trail, memory, registry, recorder, session: sessions[0] };
}

/** The `PreToolUse` hook, joined to the trail — and to what the diffs of plan 08 remember (B-25). */
describe('the recorder of tool invocations', () => {
  it('remembers a file tool of a live session once it is on the trail', async () => {
    const { trail, memory, recorder, session } = setUp();

    await recorder.record(anInvocation());

    expect(trail.entries).toHaveLength(1);
    expect(session === undefined ? null : memory.toolOf(session, 'toolu_1')).toMatchObject({
      toolName: 'Edit',
      input: { file_path: FILE },
    });
  });

  it('remembers nothing of an invocation the SDK gave no id, nor of a session already gone', async () => {
    const { memory, recorder, registry, session } = setUp();

    await recorder.record(anInvocation({ toolUseId: null }));
    registry.remove(SessionId.create(SESSION_ID));
    await recorder.record(anInvocation({ toolUseId: 'toolu_2' }));

    expect(session === undefined ? null : memory.toolOf(session, 'toolu_2')).toBeNull();
  });

  it('remembers nothing of a tool the trail could not take — and refuses it', async () => {
    const { trail, memory, recorder, session } = setUp();
    trail.failing = true;

    await expect(recorder.record(anInvocation())).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(session === undefined ? null : memory.toolOf(session, 'toolu_1')).toBeNull();
  });
});
