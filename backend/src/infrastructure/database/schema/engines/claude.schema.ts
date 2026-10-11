import { check, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { storedColumns } from '../columns';

/**
 * The tables of the Claude extension (plan 13; plan 28, B-36, D-10): what only Claude has, kept
 * under its prefix — its plugins, the preferences of its skills, and the output style its sessions
 * open with. Written by migrations `0020` and `0024`; per user, every one.
 *
 * See docs/architecture/backend/05-persistence.md.
 */

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

/**
 * The output style of a user's Claude sessions (`folder_path` NULL) and of a folder's — a style of
 * Claude's answers, so the extension's, moved out of the core's defaults by `0024` (plan 28, D-06).
 */
export const claudeOutputStyleDefaults = pgTable(
  'claude_output_style_defaults',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    folderPath: text('folder_path'),
    outputStyle: text('output_style').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('claude_output_style_defaults_user_id_folder_path_key')
      .on(table.userId, table.folderPath)
      .nullsNotDistinct(),
  ],
);
