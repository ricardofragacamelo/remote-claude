import { check, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns, engineOwnerColumns } from './columns';

/**
 * The defaults a session of each engine opens with (plan 13, B-14; plan 28, B-36), written by
 * migration `0020` and renamed by `0024`. Per user and per engine: the user's default has
 * `folder_path` NULL, a folder's override names its folder (13 · D-04). The unique key treats a NULL
 * folder as one value (`NULLS NOT DISTINCT`): two of them would be two defaults.
 *
 * See docs/architecture/backend/05-persistence.md.
 */
export const agentDefaults = pgTable(
  'agent_defaults',
  {
    ...engineOwnerColumns,
    folderPath: text('folder_path'),
    model: text('model'),
    permissionMode: text('permission_mode'),
    effort: text('effort'),
    thinking: text('thinking'),
    fallbackModel: text('fallback_model'),
    ...auditColumns,
  },
  (table) => [
    unique('agent_defaults_user_id_engine_folder_path_key')
      .on(table.userId, table.engine, table.folderPath)
      .nullsNotDistinct(),
    check(
      'agent_defaults_mode_canonical',
      sql`${table.permissionMode} IN ('ask', 'acceptEdits', 'readOnly', 'allowAll')`,
    ),
    check(
      'agent_defaults_effort_known',
      sql`${table.effort} IN ('low', 'medium', 'high', 'xhigh', 'max')`,
    ),
    check('agent_defaults_thinking_known', sql`${table.thinking} IN ('on', 'off')`),
    check('agent_defaults_engine_form', sql`${table.engine} ~ '^[a-z][a-z0-9-]{0,31}$'`),
  ],
);
