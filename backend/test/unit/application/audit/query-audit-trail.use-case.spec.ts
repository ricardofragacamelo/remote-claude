import { describe, expect, it } from 'vitest';

import { QueryAuditTrailUseCase } from '@application/audit';
import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  SessionTrailOwnership,
} from '@application/audit';
import { ToolClassifiers } from '@application/engine';
import { classifyTool } from '@adapter/outbound/engines/claude/tool-classifier';
import { AuditEntry, AuditTrailForbiddenError } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';

const caller = UserId.create('auth|caller');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');

const EMPTY: AuditTrailPage = { records: [], nextCursor: null };

/** The classifiers the composition hands over: Claude's, the default engine. */
const classifiers = new ToolClassifiers([{ engine: 'claude', classify: classifyTool }], 'claude');

/** A reader that answers what it is told to, and remembers what it was asked. */
class ScriptedReader implements AuditTrailReader {
  readonly pages: AuditTrailPageRequest[] = [];
  readonly ownershipLookups: string[] = [];

  constructor(
    private readonly ownership: SessionTrailOwnership,
    private readonly answer: AuditTrailPage = EMPTY,
  ) {}

  page(request: AuditTrailPageRequest): Promise<AuditTrailPage> {
    this.pages.push(request);
    return Promise.resolve(this.answer);
  }

  ownershipOf(session: SessionId): Promise<SessionTrailOwnership> {
    this.ownershipLookups.push(session.value);
    return Promise.resolve(this.ownership);
  }
}

const request = (overrides: Partial<AuditTrailPageRequest> = {}): AuditTrailPageRequest => ({
  userId: caller,
  sessionId: null,
  toolName: null,
  decision: null,
  from: null,
  to: null,
  before: null,
  limit: 50,
  ...overrides,
});

describe('QueryAuditTrailUseCase', () => {
  it('reads the caller`s page, as asked', async () => {
    const reader = new ScriptedReader('none');
    const query = new QueryAuditTrailUseCase(reader, classifiers);

    expect(await query.execute(request({ toolName: 'Bash', before: 42 }))).toEqual(EMPTY);
    expect(reader.pages).toEqual([request({ toolName: 'Bash', before: 42 })]);
  });

  it('never asks whose a session is when no session was asked for', async () => {
    const reader = new ScriptedReader('others');

    await new QueryAuditTrailUseCase(reader, classifiers).execute(request());

    expect(reader.ownershipLookups).toEqual([]);
  });

  it('reads a session of the caller`s', async () => {
    const reader = new ScriptedReader('mine');

    await new QueryAuditTrailUseCase(reader, classifiers).execute(request({ sessionId }));

    expect(reader.ownershipLookups).toEqual([sessionId.value]);
    expect(reader.pages).toHaveLength(1);
  });

  it('refuses a session that is somebody else`s, and reads nothing — S-26', async () => {
    const reader = new ScriptedReader('others');

    const refusal = new QueryAuditTrailUseCase(reader, classifiers).execute(request({ sessionId }));

    await expect(refusal).rejects.toBeInstanceOf(AuditTrailForbiddenError);
    await expect(refusal).rejects.toMatchObject({
      code: 'FORBIDDEN',
      messageKey: 'audit.error.forbidden',
      params: { sessionId: sessionId.value },
    });
    expect(reader.pages).toEqual([]);
  });

  it('answers a session with no entry with an empty page, not a refusal — S-73', async () => {
    // Nothing says whose it is. `403` would claim to know, and `404` would claim it cannot exist.
    const reader = new ScriptedReader('none');

    expect(
      await new QueryAuditTrailUseCase(reader, classifiers).execute(request({ sessionId })),
    ).toEqual(EMPTY);
  });

  describe('what each entry may show — plan 28, B-16 / S-52', () => {
    const entry = (seq: number, toolName: string, input: Record<string, unknown>) => ({
      seq,
      traceId: null,
      entry: AuditEntry.record({
        id: `entry-${String(seq)}`,
        userId: caller,
        sessionId,
        toolUseId: null,
        toolName,
        input,
        decision: 'recorded',
        origin: { deviceId: null, ip: null },
        at: new Date('2026-10-01T12:00:00.000Z'),
      }),
    });

    it('discloses a read by the kind the engine`s classifier gives it, and the rest whole', async () => {
      const read = entry(2, 'Read', { file_path: '/srv/.env', offset: 4, content: 'SECRET' });
      const shell = entry(1, 'Bash', { command: 'ls' });
      const reader = new ScriptedReader('none', { records: [read, shell], nextCursor: 1 });

      const page = await new QueryAuditTrailUseCase(reader, classifiers).execute(request());

      expect(page.nextCursor).toBe(1);
      expect(page.records.map((record) => record.disclosed)).toEqual([
        { paths: ['/srv/.env'], window: { offset: 4 } },
        { command: 'ls' },
      ]);
      // The entry itself is untouched: the trail keeps everything, the query shows less.
      expect(page.records[0]?.entry).toBe(read.entry);
    });

    it('says the kind the trail kept, or the classifier`s for an entry written before — S-97', async () => {
      const kept = {
        ...entry(2, 'mcp__srv__x', {}),
        entry: AuditEntry.record({
          ...entry(2, 'x', {}).entry.snapshot(),
          input: {},
          toolKind: 'file.edit',
        }),
      };
      const old = entry(1, 'Bash', { command: 'ls' });
      const reader = new ScriptedReader('none', { records: [kept, old], nextCursor: null });

      const page = await new QueryAuditTrailUseCase(reader, classifiers).execute(
        request({ kind: 'shell' }),
      );

      expect(page.records.map((record) => record.kind)).toEqual(['file.edit', 'shell']);
      expect(reader.pages[0]?.kind).toBe('shell');
    });

    it('discloses everything of an entry no classifier knows, rather than guessing a read', async () => {
      // No classifier of the default engine: every call is the generic line, shown as it was called.
      const none = new ToolClassifiers([], 'claude');
      const read = entry(1, 'Read', { file_path: '/a', limit: 1 });
      const reader = new ScriptedReader('none', { records: [read], nextCursor: null });

      const page = await new QueryAuditTrailUseCase(reader, none).execute(request());

      expect(page.records[0]?.disclosed).toEqual({ file_path: '/a', limit: 1 });
    });
  });
});
