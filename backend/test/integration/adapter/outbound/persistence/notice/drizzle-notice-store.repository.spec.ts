import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleNoticeStoreRepository } from '@adapter/outbound/persistence/notice/drizzle-notice-store.repository';
import { ConversationRef } from '@domain/engine';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import type { SessionNoticePayload } from '@remote-claude/contracts';
import { SESSION_NOTICE_PAYLOAD_LIMITS } from '@remote-claude/contracts';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../../support/fakes/sequential-ids';

/**
 * `persisted_notices` against a real PostgreSQL: the idempotent key, the engine-neutral shape, and
 * the teto of a notice's own `text` surviving a round trip (Plan 27, F7, D-15).
 */
describe('DrizzleNoticeStoreRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  const ids = new SequentialIds();

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "persisted_notices"`);
  });

  const build = () => new DrizzleNoticeStoreRepository(aPersistenceContext(connection.db), ids);

  function aNotice(
    noticeId: string,
    overrides: Partial<SessionNoticePayload> = {},
  ): SessionNoticePayload {
    return {
      noticeId,
      kind: 'agent.info',
      level: 'warning',
      origin: { engine: 'claude', native: 'system:hook_response' },
      text: 'a hook failed',
      ...overrides,
    };
  }

  async function countOf(ref: ConversationRef): Promise<number> {
    const rows = await connection.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM "persisted_notices" WHERE "engine" = ${ref.engine.value} AND "conversation_id" = ${ref.id}`,
    );
    return Number(rows.rows[0]?.count);
  }

  it('keeps a notice and reads it back, in the order it was recorded — S-109', async () => {
    const repository = build();
    const ref = ConversationRef.create('claude', 'conv-1');

    await repository.record(ref, aNotice('n1'));
    await repository.record(ref, aNotice('n2'));

    const kept = await repository.listFor(ref);
    expect(kept.map((notice) => notice.noticeId)).toEqual(['n1', 'n2']);
    expect(kept[0]?.text).toBe('a hook failed');
  });

  it('recording the same noticeId twice, in sequence, leaves one row — S-110', async () => {
    const repository = build();
    const ref = ConversationRef.create('claude', 'conv-1');

    await repository.record(ref, aNotice('n1', { text: 'first' }));
    await repository.record(ref, aNotice('n1', { text: 'second' }));

    expect(await countOf(ref)).toBe(1);
    const kept = await repository.listFor(ref);
    expect(kept[0]?.text).toBe('first');
  });

  it('two concurrent recordings of the same noticeId leave one row, neither one throwing — S-111', async () => {
    const repository = build();
    const ref = ConversationRef.create('claude', 'conv-1');

    await Promise.all([
      repository.record(ref, aNotice('n1', { text: 'first' })),
      repository.record(ref, aNotice('n1', { text: 'second' })),
    ]);

    expect(await countOf(ref)).toBe(1);
  });

  it('a conversation with no notice at all reads back empty — S-112', async () => {
    const repository = build();

    expect(await repository.listFor(ConversationRef.create('claude', 'conv-never'))).toEqual([]);
  });

  it('the text at the schema ceiling (4 000) round-trips whole, without truncating again — S-113', async () => {
    const repository = build();
    const ref = ConversationRef.create('claude', 'conv-1');
    const whole = 'x'.repeat(SESSION_NOTICE_PAYLOAD_LIMITS.text.maxLength);

    await repository.record(ref, aNotice('n1', { text: whole }));

    const [kept] = await repository.listFor(ref);
    expect(kept?.text).toHaveLength(whole.length);
  });

  it('never rejects when the write itself fails — logs and swallows, by the port’s own contract — S-116', async () => {
    const circular: Record<string, unknown> = { self: null };
    circular['self'] = circular;
    const logger = new RecordingLogger();
    const repository = new DrizzleNoticeStoreRepository(
      aPersistenceContext(connection.db, { logger: logger.logger }),
      ids,
    );
    const ref = ConversationRef.create('claude', 'conv-1');

    await expect(
      repository.record(ref, aNotice('n1', { params: circular as never })),
    ).resolves.toBeUndefined();

    expect(await repository.listFor(ref)).toEqual([]);
    expect(
      logger.lines.some(
        (line) => line['op'] === 'persistedNotice.record' && line['level'] === 'error',
      ),
    ).toBe(true);
  });

  it('the key is (engine, conversationId) — two engines with the same conversationId never collide — S-114', async () => {
    const repository = build();
    const claude = ConversationRef.create('claude', 'shared-id');
    const another = ConversationRef.create('codex', 'shared-id');

    await repository.record(claude, aNotice('n1', { text: 'from claude' }));
    await repository.record(another, aNotice('n1', { text: 'from another engine' }));

    expect((await repository.listFor(claude))[0]?.text).toBe('from claude');
    expect((await repository.listFor(another))[0]?.text).toBe('from another engine');
  });
});
