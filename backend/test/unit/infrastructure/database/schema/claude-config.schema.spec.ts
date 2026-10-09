import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  claudeDefaults,
  claudePlugins,
  claudeSkillPreferences,
  mcpProjectApprovals,
  mcpServerSecrets,
  mcpServers,
} from '@infra/database/schema';

/**
 * The tables of migration `0020` as Drizzle types them (plan 13, B-07) — the queries are typed over
 * this, and a column that drifted from the migration would be a query that compiles and fails.
 */
describe('the schema of the configuration of Claude — plan 13, B-07', () => {
  it('keeps the secrets of a server in bytea, removed with the server', () => {
    const config = getTableConfig(mcpServerSecrets);
    const ciphertext = config.columns.find((column) => column.name === 'ciphertext');

    expect(ciphertext?.getSQLType()).toBe('bytea');
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(mcpServers);
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
  });

  it('treats the folder of a user’s own row as one value in every unique key', () => {
    for (const table of [claudeDefaults, mcpServers, claudeSkillPreferences]) {
      const [unique] = getTableConfig(table).uniqueConstraints;
      expect(unique?.nullsNotDistinct, getTableConfig(table).name).toBe(true);
    }
  });

  it('names the tables as the migration does', () => {
    expect(
      [
        claudeDefaults,
        mcpServers,
        mcpServerSecrets,
        mcpProjectApprovals,
        claudePlugins,
        claudeSkillPreferences,
      ].map((table) => getTableConfig(table).name),
    ).toEqual([
      'claude_defaults',
      'mcp_servers',
      'mcp_server_secrets',
      'mcp_project_approvals',
      'claude_plugins',
      'claude_skill_preferences',
    ]);
  });
});
