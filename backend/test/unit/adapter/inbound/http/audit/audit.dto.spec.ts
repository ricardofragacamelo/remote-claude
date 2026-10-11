import { describe, expect, it } from 'vitest';

import {
  auditTrailQuerySchema,
  MAX_PAGE_SIZE,
  toAuditEntryDto,
  toAuditTrailPageDto,
} from '@adapter/inbound/http/audit/audit.dto';
import { AuditEntry, disclosedInput } from '@domain/audit';
import type { AuditEntryDraft } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { claudeTool } from '../../../../../support/builders/tool.builder';

const at = new Date('2026-09-24T12:00:00.000Z');
const owner = UserId.create('auth|owner');

const draft: AuditEntryDraft = {
  id: 'entry-1',
  userId: owner,
  sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
  toolUseId: 'tu-1',
  toolName: 'Bash',
  input: { command: 'git status' },
  decision: 'recorded',
  origin: { deviceId: null, ip: null },
  at,
};

/** An entry of the trail, with the input the query discloses — as the use case hands it over. */
const record = (overrides: Partial<AuditEntryDraft> = {}, traceId: string | null = 'trace-1') => {
  const entry = AuditEntry.record({ ...draft, ...overrides });
  const input = entry.input.value;

  return {
    seq: 7,
    entry,
    traceId,
    disclosed: disclosedInput(claudeTool(entry.toolName, input), input),
    kind: entry.toolKind ?? claudeTool(entry.toolName, input).kind,
  };
};

describe('the audit trail query', () => {
  const parse = (query: Record<string, unknown>) => auditTrailQuerySchema.safeParse(query);

  it('accepts no filter at all', () => {
    expect(parse({}).success).toBe(true);
  });

  it('accepts every filter together', () => {
    const parsed = parse({
      sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
      toolName: 'Bash',
      decision: 'allowed',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-02T00:00:00.000Z',
      cursor: '120',
      limit: '25',
    });

    expect(parsed.success && parsed.data).toMatchObject({ cursor: '120', limit: 25 });
  });

  it('accepts a period of zero width — it is empty, not wrong', () => {
    expect(parse({ from: '2026-09-01T00:00:00Z', to: '2026-09-01T00:00:00Z' }).success).toBe(true);
  });

  it('compares the period as instants, so two offsets do not fool it', () => {
    // As text, "…10:00-03:00" sorts before "…12:00Z" and would read as in order. As instants,
    // 10:00 at -03:00 is 13:00Z — after the end.
    const parsed = parse({ from: '2026-09-01T10:00:00-03:00', to: '2026-09-01T12:00:00Z' });

    expect(parsed.success).toBe(false);
  });

  it.each([
    [
      'a period that ends before it starts',
      { from: '2026-09-02T00:00:00Z', to: '2026-09-01T00:00:00Z' },
      'to',
    ],
    ['a decision the trail does not have', { decision: 'allow' }, 'decision'],
    ['a cursor with letters', { cursor: 'abc' }, 'cursor'],
    ['a cursor of zero', { cursor: '0' }, 'cursor'],
    ['a negative cursor', { cursor: '-5' }, 'cursor'],
    ['a cursor with a leading zero', { cursor: '012' }, 'cursor'],
    ['a cursor longer than any seq', { cursor: '1'.repeat(16) }, 'cursor'],
    ['a page of none', { limit: '0' }, 'limit'],
    ['a page above the ceiling', { limit: String(MAX_PAGE_SIZE + 1) }, 'limit'],
    ['a page that is not whole', { limit: '2.5' }, 'limit'],
    ['a date without an offset', { from: '2026-09-01T00:00:00' }, 'from'],
    ['an empty tool name', { toolName: '' }, 'toolName'],
  ])('refuses %s — S-70', (_label, query, field) => {
    const parsed = parse(query);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toContain(field);
  });

  it.each(['shell', 'file.edit', 'web.fetch'])('accepts the kind %s — plan 28, B-33', (kind) => {
    expect(parse({ kind })).toMatchObject({ success: true, data: { kind } });
  });

  it.each(['', 'Shell', 'file.', 'shell(x)', 'a'.repeat(65)])('refuses the kind %j', (kind) => {
    expect(parse({ kind }).success).toBe(false);
  });

  it('accepts a page at the ceiling and a page of one — S-70', () => {
    expect(parse({ limit: String(MAX_PAGE_SIZE) }).success).toBe(true);
    expect(parse({ limit: '1' }).success).toBe(true);
  });
});

describe('the audit entry, as the client sees it', () => {
  it('says what ran, when, and under which trace', () => {
    expect(toAuditEntryDto(record())).toEqual({
      id: 'entry-1',
      sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
      toolUseId: 'tu-1',
      toolName: 'Bash',
      kind: 'shell',
      input: { command: 'git status' },
      decision: 'recorded',
      at: '2026-09-24T12:00:00.000Z',
      traceId: 'trace-1',
      verdict: null,
    });
  });

  it('says the kind the trail kept, beside the engine name — plan 28, B-33', () => {
    expect(toAuditEntryDto(record({ toolName: 'Edit', toolKind: 'file.edit' }))).toMatchObject({
      toolName: 'Edit',
      kind: 'file.edit',
    });
  });

  it('never hands back what a `file.read` read, only its path and window — S-27, plan 28 S-52', () => {
    const dto = toAuditEntryDto(
      record({ toolName: 'Read', input: { file_path: '/srv/.env', limit: 5, content: 'SECRET' } }),
    );

    expect(dto.input).toEqual({ paths: ['/srv/.env'], window: { limit: 5 } });
    expect(JSON.stringify(dto)).not.toContain('SECRET');
  });

  it('carries the verdict of a decision a rule took — S-30', () => {
    const dto = toAuditEntryDto(
      record({
        decision: 'allowed',
        verdict: {
          requestId: 'req-1',
          auto: true,
          ruleId: 'rule-1',
          scope: 'always',
          resolvedBy: owner,
          resolvedFrom: null,
        },
      }),
    );

    expect(dto.verdict).toEqual({
      requestId: 'req-1',
      auto: true,
      ruleId: 'rule-1',
      scope: 'always',
      resolvedBy: 'auth|owner',
      resolvedFrom: null,
    });
  });

  it('carries the refusal nobody made with nobody as its author — S-79', () => {
    const dto = toAuditEntryDto(
      record({
        decision: 'denied',
        verdict: {
          requestId: 'req-1',
          auto: true,
          ruleId: null,
          scope: 'once',
          resolvedBy: null,
          resolvedFrom: null,
        },
      }),
    );

    expect(dto.verdict).toMatchObject({ auto: true, ruleId: null, resolvedBy: null });
  });

  it('says so when an entry was written outside any trace', () => {
    expect(toAuditEntryDto(record({}, null)).traceId).toBeNull();
  });
});

describe('the audit trail page, as the client sees it', () => {
  it('hands the cursor over as an opaque string', () => {
    expect(toAuditTrailPageDto({ records: [record()], nextCursor: 7 })).toMatchObject({
      entries: [expect.objectContaining({ id: 'entry-1' })],
      nextCursor: '7',
    });
  });

  it('says there is no next page with `null`, not an empty string — S-71', () => {
    expect(toAuditTrailPageDto({ records: [], nextCursor: null })).toEqual({
      entries: [],
      nextCursor: null,
    });
  });
});
