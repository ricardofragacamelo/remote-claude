import {
  check,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { engineOwnerColumns, storedColumns } from './columns';

/** `bytea`, as a `Buffer` — the only shape a ciphertext is ever handled in. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * The tables of the MCP servers a session of an engine is given (plan 13; plan 28, B-36, D-06):
 * written by migration `0020`, given their `engine` by `0024`. MCP is an open protocol, so a
 * capability of the core — kept by engine, since one engine's server is not the next one's.
 *
 * Every one is **per user**: what one person set never reaches another's session. The unique keys
 * treat a NULL folder as one value (`NULLS NOT DISTINCT`).
 *
 * See docs/architecture/backend/05-persistence.md.
 */

/** The store of MCP servers (13 · D-01). The values of env and headers live in the next table. */
export const mcpServers = pgTable(
  'mcp_servers',
  {
    ...engineOwnerColumns,
    name: text('name').notNull(),
    scope: text('scope').notNull(),
    folderPath: text('folder_path'),
    transport: text('transport').notNull(),
    command: text('command'),
    args: jsonb('args').$type<string[]>().notNull(),
    url: text('url'),
    ...storedColumns(),
  },
  (table) => [
    unique('mcp_servers_user_id_engine_scope_folder_name_key')
      .on(table.userId, table.engine, table.scope, table.folderPath, table.name)
      .nullsNotDistinct(),
    check('mcp_servers_scope_known', sql`${table.scope} IN ('user', 'folder')`),
    check(
      'mcp_servers_folder_matches_scope',
      sql`(${table.scope} = 'folder') = (${table.folderPath} IS NOT NULL)`,
    ),
    check('mcp_servers_transport_known', sql`${table.transport} IN ('stdio', 'http', 'sse')`),
    check(
      'mcp_servers_transport_fields',
      sql`(${table.transport} = 'stdio' AND ${table.command} IS NOT NULL AND ${table.url} IS NULL)
        OR (${table.transport} IN ('http', 'sse') AND ${table.url} IS NOT NULL AND ${table.command} IS NULL)`,
    ),
    check('mcp_servers_engine_form', sql`${table.engine} ~ '^[a-z][a-z0-9-]{0,31}$'`),
  ],
);

/**
 * One variable or header of a server, encrypted (AES-256-GCM, 13 · D-02): never the value in clear.
 * `ciphertext`, `iv` and `tag` are NULL together for a name whose value is empty. A server's, so of
 * the server's engine.
 */
export const mcpServerSecrets = pgTable(
  'mcp_server_secrets',
  {
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServers.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    ciphertext: bytea('ciphertext'),
    iv: bytea('iv'),
    tag: bytea('tag'),
    /** Where the name stands in the list the person wrote — the order a variable list is shown in. */
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.kind, table.name] }),
    check('mcp_server_secrets_kind_known', sql`${table.kind} IN ('env', 'header')`),
  ],
);

/** Our approval of one entry of a folder's `.mcp.json`, by the digest of the entry (13 · D-11). */
export const mcpProjectApprovals = pgTable(
  'mcp_project_approvals',
  {
    userId: text('user_id').notNull(),
    engine: text('engine').notNull(),
    folderPath: text('folder_path').notNull(),
    name: text('name').notNull(),
    digest: text('digest').notNull(),
    decision: text('decision').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),

    // `null` for a `rejected` decision, or for a row written before this column existed
    // (plan 13, B-28, D-80) — the diff of a `changed` entry falls back to saying it changed, with
    // nothing of what was approved left to show beside it.
    snapshot: jsonb('snapshot'),
  },
  (table) => [
    primaryKey({
      name: 'mcp_project_approvals_user_engine_folder_name_pkey',
      columns: [table.userId, table.engine, table.folderPath, table.name],
    }),
    check(
      'mcp_project_approvals_decision_known',
      sql`${table.decision} IN ('approved', 'rejected')`,
    ),
    check('mcp_project_approvals_engine_form', sql`${table.engine} ~ '^[a-z][a-z0-9-]{0,31}$'`),
  ],
);
