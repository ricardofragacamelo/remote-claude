import { describe, expect, it } from 'vitest';

import { QueryAuditTrailUseCase } from '@application/audit';
import type {
  AuditTrailPage,
  AuditTrailPageRequest,
  AuditTrailReader,
  SessionTrailOwnership,
} from '@application/audit';
import { AuditTrailForbiddenError } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';

const caller = UserId.create('auth|caller');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');

const EMPTY: AuditTrailPage = { records: [], nextCursor: null };

/** A reader that answers what it is told to, and remembers what it was asked. */
class ScriptedReader implements AuditTrailReader {
  readonly pages: AuditTrailPageRequest[] = [];
  readonly ownershipLookups: string[] = [];

  constructor(private readonly ownership: SessionTrailOwnership) {}

  page(request: AuditTrailPageRequest): Promise<AuditTrailPage> {
    this.pages.push(request);
    return Promise.resolve(EMPTY);
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
    const query = new QueryAuditTrailUseCase(reader);

    expect(await query.execute(request({ toolName: 'Bash', before: 42 }))).toBe(EMPTY);
    expect(reader.pages).toEqual([request({ toolName: 'Bash', before: 42 })]);
  });

  it('never asks whose a session is when no session was asked for', async () => {
    const reader = new ScriptedReader('others');

    await new QueryAuditTrailUseCase(reader).execute(request());

    expect(reader.ownershipLookups).toEqual([]);
  });

  it('reads a session of the caller`s', async () => {
    const reader = new ScriptedReader('mine');

    await new QueryAuditTrailUseCase(reader).execute(request({ sessionId }));

    expect(reader.ownershipLookups).toEqual([sessionId.value]);
    expect(reader.pages).toHaveLength(1);
  });

  it('refuses a session that is somebody else`s, and reads nothing — S-26', async () => {
    const reader = new ScriptedReader('others');

    const refusal = new QueryAuditTrailUseCase(reader).execute(request({ sessionId }));

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

    expect(await new QueryAuditTrailUseCase(reader).execute(request({ sessionId }))).toBe(EMPTY);
  });
});
