import { describe, expect, it } from 'vitest';

import { MCP_LIMITS, mcpFieldIssues } from '@/features/mcp/lib/mcp-validation';
import type { McpServerFields } from '@/features/mcp/types/mcp';

const STDIO: McpServerFields = {
  name: 'github',
  scope: 'user',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  env: [{ name: 'TOKEN', value: 'x' }],
};

const REMOTE: McpServerFields = {
  name: 'metrics',
  scope: 'user',
  transport: 'http',
  url: 'https://mcp.example.com',
  headers: [{ name: 'X-Token', value: 'x' }],
};

function fieldsOf(issues: readonly { readonly field: string }[]): readonly string[] {
  return issues.map((issue) => issue.field);
}

describe('mcpFieldIssues — name and scope, plan 13, B-28, S-132', () => {
  it('finds nothing wrong with a clean stdio config', () => {
    expect(mcpFieldIssues(STDIO)).toEqual([]);
  });

  it('finds nothing wrong with a clean remote config', () => {
    expect(mcpFieldIssues(REMOTE)).toEqual([]);
  });

  it('requires a name', () => {
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, name: '' }))).toContain('name');
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, name: '   ' }))).toContain('name');
  });

  it('refuses a name with a character outside the universal pattern', () => {
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, name: 'bad name' }))).toContain('name');
  });

  it('refuses a name with two underscores in a row', () => {
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, name: 'a__b' }))).toContain('name');
  });

  it('requires a folder when the scope is folder', () => {
    const issues = mcpFieldIssues({ ...STDIO, scope: 'folder', folderPath: '' });
    expect(fieldsOf(issues)).toContain('folderPath');
  });

  it('asks nothing of the folder when one is given', () => {
    const issues = mcpFieldIssues({ ...STDIO, scope: 'folder', folderPath: '/srv/app' });
    expect(fieldsOf(issues)).not.toContain('folderPath');
  });
});

describe('mcpFieldIssues — stdio fields', () => {
  it('requires a command', () => {
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, command: '' }))).toContain('command');
  });

  it('refuses a command past the ceiling', () => {
    const issues = mcpFieldIssues({
      ...STDIO,
      command: 'x'.repeat(MCP_LIMITS.maxCommandLength + 1),
    });
    expect(fieldsOf(issues)).toContain('command');
  });

  it('refuses more arguments than the ceiling', () => {
    const args = Array.from({ length: MCP_LIMITS.maxArgs + 1 }, (_v, i) => String(i));
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, args }))).toContain('args');
  });

  it('refuses one argument past its own ceiling', () => {
    const args = ['x'.repeat(MCP_LIMITS.maxArgLength + 1)];
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, args }))).toContain('args');
  });

  it('refuses more env vars than the ceiling', () => {
    const env = Array.from({ length: MCP_LIMITS.maxEnvVars + 1 }, (_v, i) => ({
      name: `VAR_${String(i)}`,
      value: 'x',
    }));
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, env }))).toContain('env');
  });

  it('refuses an env var name that breaks the pattern', () => {
    const env = [{ name: '1bad', value: 'x' }];
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, env }))).toContain('env');
  });

  it('refuses a duplicate env var name', () => {
    const env = [
      { name: 'TOKEN', value: 'x' },
      { name: 'TOKEN', value: 'y' },
    ];
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, env }))).toContain('env');
  });

  it('refuses an env value past the ceiling', () => {
    const env = [{ name: 'TOKEN', value: 'x'.repeat(MCP_LIMITS.maxEnvValueLength + 1) }];
    expect(fieldsOf(mcpFieldIssues({ ...STDIO, env }))).toContain('env');
  });

  it('finds nothing wrong with no env vars at all', () => {
    expect(mcpFieldIssues({ ...STDIO, env: [] })).toEqual([]);
  });
});

describe('mcpFieldIssues — remote fields', () => {
  it('requires a URL', () => {
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, url: '' }))).toContain('url');
  });

  it('refuses a URL past the ceiling', () => {
    const url = `https://example.com/${'x'.repeat(MCP_LIMITS.maxUrlLength)}`;
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, url }))).toContain('url');
  });

  it('refuses a URL that does not even parse', () => {
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, url: 'not a url' }))).toContain('url');
  });

  it('refuses a scheme other than http or https', () => {
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, url: 'ftp://example.com' }))).toContain('url');
  });

  it('refuses more headers than the ceiling', () => {
    const headers = Array.from({ length: MCP_LIMITS.maxHeaders + 1 }, (_v, i) => ({
      name: `X-Header-${String(i)}`,
      value: 'x',
    }));
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, headers }))).toContain('headers');
  });

  it('refuses a header name that breaks the RFC 7230 token pattern', () => {
    const headers = [{ name: 'bad header', value: 'x' }];
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, headers }))).toContain('headers');
  });

  it('refuses a duplicate header name, case-insensitively', () => {
    const headers = [
      { name: 'X-Token', value: 'x' },
      { name: 'x-token', value: 'y' },
    ];
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, headers }))).toContain('headers');
  });

  it('refuses a header value past the ceiling', () => {
    const headers = [{ name: 'X-Token', value: 'x'.repeat(MCP_LIMITS.maxHeaderValueLength + 1) }];
    expect(fieldsOf(mcpFieldIssues({ ...REMOTE, headers }))).toContain('headers');
  });

  it('finds nothing wrong with no headers at all', () => {
    expect(mcpFieldIssues({ ...REMOTE, headers: [] })).toEqual([]);
  });
});
