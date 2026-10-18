import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { agentDefaults } from '@infra/database/schema';

/**
 * `agent_defaults`, as Drizzle types it (plan 13, B-07; plan 28, B-36: renamed from
 * `claude_defaults` by migration `0024`, with its `engine` column) — the queries are typed over
 * this, and a column that drifted from the migration would be a query that compiles and fails.
 */
describe('the schema of the defaults of an engine — plan 28, B-36', () => {
  it('treats the folder of a user’s own row as one value in the unique key', () => {
    const [unique] = getTableConfig(agentDefaults).uniqueConstraints;

    expect(unique?.nullsNotDistinct).toBe(true);
    expect(unique?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'engine',
      'folder_path',
    ]);
  });

  it('names the table as the migration does', () => {
    expect(getTableConfig(agentDefaults).name).toBe('agent_defaults');
  });
});
