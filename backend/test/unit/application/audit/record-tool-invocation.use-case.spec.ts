import { beforeEach, describe, expect, it } from 'vitest';

import { RecordToolInvocationUseCase } from '@application/audit';
import type { AuditRepository } from '@application/audit';
import { AuditUnavailableError } from '@domain/audit';
import type { AuditEntry } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const other = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');
const at = new Date('2026-09-18T12:00:00.000Z');

/** A trail that writes, or refuses to, on command. */
class SwitchableTrail implements AuditRepository {
  readonly written: AuditEntry[] = [];
  failing = false;

  append(entry: AuditEntry): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('the database is gone'));
    }

    this.written.push(entry);
    return Promise.resolve();
  }
}

describe('RecordToolInvocationUseCase', () => {
  let trail: SwitchableTrail;
  let useCase: RecordToolInvocationUseCase;

  beforeEach(() => {
    trail = new SwitchableTrail();
    useCase = new RecordToolInvocationUseCase(trail, new SequentialIds());
  });

  const record = (session = sessionId): ReturnType<RecordToolInvocationUseCase['execute']> =>
    useCase.execute({
      userId: owner,
      sessionId: session,
      toolUseId: 'tu-1',
      toolName: 'Bash',
      input: { command: 'git status' },
      decision: 'recorded',
      origin: { deviceId: null, ip: null },
      at,
    });

  it('writes the invocation and lets the tool through', async () => {
    expect(await record()).toBe('recorded');
    expect(trail.written).toHaveLength(1);
  });

  it('writes every invocation, not one per tool name — S-40', async () => {
    await record();
    await record();

    expect(trail.written).toHaveLength(2);
  });

  it('mints an id of its own, so two invocations never share a record', async () => {
    await record();
    await record();

    expect(trail.written[0]?.id).not.toBe(trail.written[1]?.id);
  });

  describe('when the trail cannot be written — D-07', () => {
    beforeEach(() => {
      trail.failing = true;
    });

    it('refuses the tool on the first failure, with the session alive — S-45', async () => {
      // Without a trail there is no authorisation. A blip of network or a container restarting
      // must not cost anybody their work, so the session survives the first one.
      expect(await record()).toBe('refuseTool');
    });

    it('ends the session on the second consecutive failure', async () => {
      await record();

      expect(await record()).toBe('closeSession');
    });

    it('keeps ending it while the failures continue', async () => {
      await record();
      await record();

      expect(await record()).toBe('closeSession');
    });

    it('says how many failures in a row, and what the database said', async () => {
      await record();
      await record();

      const failure = useCase.lastFailure as AuditUnavailableError;
      expect(failure.consecutiveFailures).toBe(2);
      expect(String((failure.cause as Error).message)).toContain('the database is gone');
    });

    it('is an error of ours, never of the caller’s', async () => {
      await record();

      expect(useCase.lastFailure?.code).toBe('INTERNAL_ERROR');
    });

    it('counts per session, so one session’s bad luck is not another’s', async () => {
      await record(sessionId);

      expect(await record(other)).toBe('refuseTool');
    });
  });

  it('forgets the failures once a write gets through', async () => {
    // Two failures with a success between them are two hiccups, not a trail that has stopped.
    trail.failing = true;
    await record();

    trail.failing = false;
    expect(await record()).toBe('recorded');
    expect(useCase.consecutiveFailures(sessionId)).toBe(0);

    trail.failing = true;
    expect(await record()).toBe('refuseTool');
  });

  it('clears the last failure once a write gets through', async () => {
    trail.failing = true;
    await record();
    trail.failing = false;
    await record();

    expect(useCase.lastFailure).toBeNull();
  });

  it('never throws — the decision is the answer, not an exception', async () => {
    trail.failing = true;

    await expect(record()).resolves.toBe('refuseTool');
  });
});
