import { mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { DrizzleMcpServerRepository } from '@adapter/outbound/persistence/mcp/mcp-server.repository';
import { createMcpServerConfig, SecretStoreUnavailableError } from '@domain/mcp';
import type { McpEngineDialect } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { DuplicateMcpServerNameError } from '@application/mcp';
import type { McpServerRepository, McpServerWrite } from '@application/mcp';
import { openDatabase } from '@infra/database/connection';
import type { DatabaseConnection } from '@infra/database/connection';
import { migrate } from '@infra/database/migrator';
import { startPostgres } from '../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../support/containers/postgres';
import { aPersistenceContext } from '../../../../../support/fakes/persistence-context';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const USER = UserId.create('auth|mcp-owner');
const OTHER_USER = UserId.create('auth|mcp-other');
const ENGINE = 'claude';
const NOW = new Date('2026-10-19T12:00:00.000Z');
const SECRET_VALUE = 'ghp_super-secret-token-value';

const DIALECT: McpEngineDialect = {
  engine: ENGINE,
  rejectsServerName: () => null,
  reservedEnvNames: [],
};

/** A key file of exactly 32 random bytes, base64-encoded — a valid MCP secret key (plan 13, D-02). */
function writeKeyFile(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, randomBytes(32).toString('base64'), 'utf8');
  return file;
}

function writeOf(
  userId: UserId,
  overrides: Partial<Parameters<typeof createMcpServerConfig>[0]> = {},
): McpServerWrite {
  const config = createMcpServerConfig(
    {
      name: 'github',
      scope: 'user',
      folderPath: null,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
      env: [{ name: 'GITHUB_TOKEN', value: SECRET_VALUE }],
      ...overrides,
    },
    DIALECT,
  );
  return { userId, engine: ENGINE, config };
}

/**
 * The store of MCP servers, against a real PostgreSQL (plan 13, B-19).
 *
 * Against a real one because what this suite proves is the database's: a unique index settling a
 * name race atomically, a `pg_advisory_xact_lock` actually serialising two writers, and bytes on
 * disk that a `SELECT *` cannot turn back into the token (S-69, S-72, S-74, S-80).
 */
describe('DrizzleMcpServerRepository', () => {
  let database: DisposablePostgres;
  let connection: DatabaseConnection;
  let keyFile: string;

  beforeAll(async () => {
    database = await startPostgres();
    connection = openDatabase(database.url);
    await migrate(connection.pool);
    keyFile = writeKeyFile();
  });

  afterAll(async () => {
    await connection.pool.end();
    await database.stop();
  });

  afterEach(async () => {
    await connection.db.execute(sql`TRUNCATE TABLE "mcp_server_secrets", "mcp_servers"`);
  });

  function repository(file = keyFile, logger?: RecordingLogger): McpServerRepository {
    return new DrizzleMcpServerRepository(
      aPersistenceContext(connection.db, logger === undefined ? {} : { logger: logger.logger }),
      file,
    );
  }

  it('stores a server and reads it back with only the env var names, never the value (S-70)', async () => {
    const stored = await repository().insert('srv-1', writeOf(USER), NOW);

    expect(stored).toMatchObject({ name: 'github', envNames: ['GITHUB_TOKEN'] });
    expect(JSON.stringify(stored)).not.toContain(SECRET_VALUE);

    const found = await repository().findById('srv-1');
    expect(found).toMatchObject({ name: 'github', envNames: ['GITHUB_TOKEN'] });
  });

  it('encrypts the secret at rest — the raw row has no trace of the value (S-72)', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);

    const [row] = (
      await connection.db.execute<{
        ciphertext: Buffer | null;
        iv: Buffer | null;
        tag: Buffer | null;
      }>(sql`SELECT ciphertext, iv, tag FROM mcp_server_secrets WHERE server_id = 'srv-1'`)
    ).rows;

    expect(row?.ciphertext).not.toBeNull();
    expect(row?.iv).not.toBeNull();
    expect(row?.tag).not.toBeNull();
    expect(row?.ciphertext?.toString('latin1')).not.toContain(SECRET_VALUE);
  });

  it('reveals the decrypted value only through reveal() — round trips exactly', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);

    const revealed = await repository().reveal('srv-1');
    expect(revealed?.env).toEqual([{ name: 'GITHUB_TOKEN', value: SECRET_VALUE }]);
  });

  it('answers null from reveal() for an id that does not exist', async () => {
    expect(await repository().reveal('does-not-exist')).toBeNull();
  });

  it('reveals a server with no secrets at all without ever touching the key file', async () => {
    await repository().insert('srv-1', writeOf(USER, { env: [] }), NOW);

    // A key file nobody could read: if reveal() needed it for a server with no secrets, this
    // would throw — it must not, because there is nothing here to decrypt.
    const revealed = await repository('/does/not/exist').reveal('srv-1');
    expect(revealed?.env).toEqual([]);
  });

  it('round-trips an explicitly empty secret value without ever needing the key', async () => {
    await repository().insert(
      'srv-1',
      writeOf(USER, { env: [{ name: 'EMPTY_TOKEN', value: '' }] }),
      NOW,
    );

    const revealed = await repository('/does/not/exist').reveal('srv-1');
    expect(revealed?.env).toEqual([{ name: 'EMPTY_TOKEN', value: '' }]);
  });

  it('checks the name conflict for a folder-scoped server by its folder, not just its name', async () => {
    const folder = '/workspace/project';
    await repository().insert('srv-1', writeOf(USER, { scope: 'folder', folderPath: folder }), NOW);

    await expect(
      repository().insert('srv-2', writeOf(USER, { scope: 'folder', folderPath: folder }), NOW),
    ).rejects.toThrow(DuplicateMcpServerNameError);

    // A different folder is a different identity — no conflict.
    await expect(
      repository().insert(
        'srv-3',
        writeOf(USER, { scope: 'folder', folderPath: '/workspace/other' }),
        NOW,
      ),
    ).resolves.toMatchObject({ name: 'github' });
  });

  it('refuses a name already taken in the same scope — the unique index, not a race (S-69)', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    await expect(repository().insert('srv-2', writeOf(USER), NOW)).rejects.toThrow(
      DuplicateMcpServerNameError,
    );
  });

  it('allows the same name for two different users', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    await expect(repository().insert('srv-2', writeOf(OTHER_USER), NOW)).resolves.toMatchObject({
      name: 'github',
    });
  });

  it('does not write anything — not even the structural row — when the key file is unusable and a secret is involved (S-73)', async () => {
    const badFile = path.join(tmpdir(), 'rc-mcp-key-missing', 'key');

    await expect(repository(badFile).insert('srv-1', writeOf(USER), NOW)).rejects.toThrow(
      SecretStoreUnavailableError,
    );
    expect(await repository().findById('srv-1')).toBeNull();
  });

  it('still stores a server with no secret at all when the key file is unusable (S-73)', async () => {
    const badFile = path.join(tmpdir(), 'rc-mcp-key-missing', 'key');
    const write = writeOf(USER, { env: [] });

    const stored = await repository(badFile).insert('srv-1', write, NOW);
    expect(stored.envNames).toEqual([]);
  });

  it('never writes the secret value to the log, at any level (S-74)', async () => {
    const logger = new RecordingLogger();
    await repository(keyFile, logger).insert('srv-1', writeOf(USER), NOW);
    await repository(keyFile, logger).update('srv-1', writeOf(USER, { command: 'npx2' }), NOW);
    await repository(keyFile, logger).reveal('srv-1');

    const serialised = JSON.stringify(logger.lines);
    expect(serialised).not.toContain(SECRET_VALUE);
  });

  it('replaces the secrets on update — old ciphertext rows are gone, new ones take their place', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    await repository().update(
      'srv-1',
      writeOf(USER, { env: [{ name: 'OTHER_TOKEN', value: 'rotated' }] }),
      NOW,
    );

    const revealed = await repository().reveal('srv-1');
    expect(revealed?.env).toEqual([{ name: 'OTHER_TOKEN', value: 'rotated' }]);
  });

  it('cascades the delete to the secrets table', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    await repository().delete('srv-1');

    const rows = await connection.db.execute(
      sql`SELECT 1 FROM mcp_server_secrets WHERE server_id = 'srv-1'`,
    );
    expect(rows.rows).toEqual([]);
  });

  it('toggles enabled independently of the rest of the row', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    const toggled = await repository().setEnabled('srv-1', false, NOW);
    expect(toggled.enabled).toBe(false);
    expect(toggled.envNames).toEqual(['GITHUB_TOKEN']);
  });

  it('lets exactly one of two concurrent updates of the same server win, with no field mixing (S-80)', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);

    const [a, b] = await Promise.all([
      repository().update('srv-1', writeOf(USER, { command: 'command-a' }), NOW),
      repository().update('srv-1', writeOf(USER, { command: 'command-b' }), NOW),
    ]);

    // Both calls succeed (the lock serialises them; neither is a name conflict with itself), and
    // the row that lands is whichever ran last — never a mix of the two.
    const final = await repository().findById('srv-1');
    expect([a.command, b.command]).toContain(final?.command);
    expect(final?.command === 'command-a' || final?.command === 'command-b').toBe(true);
  });

  it('lists only the caller’s servers, scoped by engine', async () => {
    await repository().insert('srv-1', writeOf(USER), NOW);
    await repository().insert('srv-2', writeOf(OTHER_USER, { name: 'other' }), NOW);

    const mine = await repository().listFor(USER, ENGINE);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.name).toBe('github');
  });
});
