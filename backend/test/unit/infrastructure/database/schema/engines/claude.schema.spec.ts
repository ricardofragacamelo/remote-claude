import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  claudeOutputStyleDefaults,
  claudePlugins,
  claudeSkillPreferences,
} from '@infra/database/schema';

/**
 * The tables of the Claude extension, as Drizzle types them (plan 13, B-07; plan 28, B-36, D-10) —
 * the queries are typed over this, and a column that drifted from the migration would be a query
 * that compiles and fails.
 */
describe('the schema of Claude’s extension — plan 28, B-36', () => {
  it('treats the folder of a user’s own row as one value in every unique key', () => {
    for (const table of [claudeSkillPreferences, claudeOutputStyleDefaults]) {
      const [unique] = getTableConfig(table).uniqueConstraints;
      expect(unique?.nullsNotDistinct, getTableConfig(table).name).toBe(true);
    }
  });

  it('names the tables as the migration does', () => {
    expect(
      [claudePlugins, claudeSkillPreferences, claudeOutputStyleDefaults].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual(['claude_plugins', 'claude_skill_preferences', 'claude_output_style_defaults']);
  });
});
