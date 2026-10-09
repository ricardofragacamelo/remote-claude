import {
  boolean,
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

import { auditColumns } from './columns';

/** `bytea`, as a `Buffer` — the only shape a ciphertext is ever handled in. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * The tables of the configuration of Claude (plan 13), written by migration `0020`.
 *
 * Every one is **per user**: the CLI of the machine has one login, and what one person set never
 * reaches another's session. The unique keys treat a NULL folder as one value (`NULLS NOT
 * DISTINCT`): the user's own row has none, and two of them would be two defaults.
 *
 * See docs/architecture/backend/05-persistence.md#a-configuração-do-claude.
 */

/** What a server and a plugin both carry: switched on or off, and when they were added and changed. */
const storedColumns = () => ({
  enabled: boolean('enabled').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The defaults of a user (`folder_path` NULL) and the overrides of a folder (13 · D-04). */
export const claudeDefaults = pgTable(
  'claude_defaults',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    folderPath: text('folder_path'),
    model: text('model'),
    permissionMode: text('permission_mode'),
    effort: text('effort'),
    thinking: text('thinking'),
    outputStyle: text('output_style'),
    fallbackModel: text('fallback_model'),
    ...auditColumns,
  },
  (table) => [
    unique('claude_defaults_user_id_folder_path_key')
      .on(table.userId, table.folderPath)
      .nullsNotDistinct(),
    check(
      'claude_defaults_mode_known',
      sql`${table.permissionMode} IN ('default', 'acceptEdits', 'plan', 'allowAll')`,
    ),
    check(
      'claude_defaults_effort_known',
      sql`${table.effort} IN ('low', 'medium', 'high', 'xhigh', 'max')`,
    ),
    check('claude_defaults_thinking_known', sql`${table.thinking} IN ('on', 'off')`),
  ],
);

/** The store of MCP servers (13 · D-01). The values of env and headers live in the next table. */
export const mcpServers = pgTable(
  'mcp_servers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
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
    unique('mcp_servers_user_id_scope_folder_name_key')
      .on(table.userId, table.scope, table.folderPath, table.name)
      .nullsNotDistinct(),
    check('mcp_servers_scope_known', sql`${table.scope} IN ('user', 'folder')`),
    check('mcp_servers_transport_known', sql`${table.transport} IN ('stdio', 'http', 'sse')`),
  ],
);

/**
 * One variable or header of a server, encrypted (AES-256-GCM, 13 · D-02): never the value in clear.
 * `ciphertext`, `iv` and `tag` are NULL together for a name whose value is empty.
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
    folderPath: text('folder_path').notNull(),
    name: text('name').notNull(),
    digest: text('digest').notNull(),
    decision: text('decision').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.folderPath, table.name] }),
    check(
      'mcp_project_approvals_decision_known',
      sql`${table.decision} IN ('approved', 'rejected')`,
    ),
  ],
);

/** A plugin of a user: a local directory, or one a declared marketplace gave (13 · D-15). */
export const claudePlugins = pgTable(
  'claude_plugins',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    origin: text('origin').notNull(),
    path: text('path').notNull(),
    name: text('name').notNull(),
    marketplace: text('marketplace'),
    commit: text('commit'),
    /** The digest of what the person saw and approved; files that no longer have it are pending. */
    approvedDigest: text('approved_digest').notNull(),
    ...storedColumns(),
  },
  (table) => [
    unique('claude_plugins_user_id_path_key').on(table.userId, table.path),
    check('claude_plugins_origin_known', sql`${table.origin} IN ('local', 'marketplace')`),
  ],
);

/** Which sources of skills are on, and which skills are off — for a user, or a folder (13 · B-34). */
export const claudeSkillPreferences = pgTable(
  'claude_skill_preferences',
  {
    userId: text('user_id').notNull(),
    folderPath: text('folder_path'),
    sources: jsonb('sources').$type<Record<string, boolean>>().notNull(),
    disabledSkills: jsonb('disabled_skills').$type<string[]>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('claude_skill_preferences_user_id_folder_path_key')
      .on(table.userId, table.folderPath)
      .nullsNotDistinct(),
  ],
);
