import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { mcpProjectApprovals, mcpServerSecrets, mcpServers } from '@infra/database/schema';

/**
 * The tables of MCP, as Drizzle types them (plan 13, B-07; plan 28, B-36, D-06: given their
 * `engine` by migration `0024` — MCP is an open protocol, a capability of the core, kept by
 * engine) — the queries are typed over this, and a column that drifted from the migration would
 * be a query that compiles and fails.
 */
describe('the schema of MCP — plan 28, B-36', () => {
  it('keeps the secrets of a server in bytea, removed with the server', () => {
    const config = getTableConfig(mcpServerSecrets);
    const ciphertext = config.columns.find((column) => column.name === 'ciphertext');

    expect(ciphertext?.getSQLType()).toBe('bytea');
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(mcpServers);
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
  });

  it('treats the folder of a user’s own row as one value in the unique key', () => {
    const [unique] = getTableConfig(mcpServers).uniqueConstraints;

    expect(unique?.nullsNotDistinct).toBe(true);
    expect(unique?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'engine',
      'scope',
      'folder_path',
      'name',
    ]);
  });

  it('names the tables as the migration does', () => {
    expect(
      [mcpServers, mcpServerSecrets, mcpProjectApprovals].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual(['mcp_servers', 'mcp_server_secrets', 'mcp_project_approvals']);
  });
});
