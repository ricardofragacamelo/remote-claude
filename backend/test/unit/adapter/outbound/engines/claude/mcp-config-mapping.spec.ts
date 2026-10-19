import { describe, expect, it } from 'vitest';

import { toSdkMcpServerConfig } from '@adapter/outbound/engines/claude/mcp-config-mapping';
import { createMcpServerConfig } from '@domain/mcp';
import type { McpEngineDialect, McpServerConfig } from '@domain/mcp';

const DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: () => null,
  reservedEnvNames: [],
};

describe('toSdkMcpServerConfig — plan 13, B-21, D-02, D-25', () => {
  it('maps a stdio server, with env values present', () => {
    const config = createMcpServerConfig(
      {
        name: 'github',
        scope: 'user',
        folderPath: null,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server-github'],
        env: [{ name: 'GITHUB_TOKEN', value: 'secret-value' }],
      },
      DIALECT,
    );

    expect(toSdkMcpServerConfig(config, {})).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
      env: { GITHUB_TOKEN: 'secret-value' },
    });
  });

  it('expands ${VAR} against the given environment — our own expansion, D-25', () => {
    const config = createMcpServerConfig(
      {
        name: 'github',
        scope: 'user',
        folderPath: null,
        transport: 'stdio',
        command: 'npx',
        env: [{ name: 'GITHUB_TOKEN', value: 'Bearer ${API_TOKEN}' }],
      },
      DIALECT,
    );

    const mapped = toSdkMcpServerConfig(config, { API_TOKEN: 'abc123' });
    expect(mapped.type === 'stdio' && mapped.env?.['GITHUB_TOKEN']).toBe('Bearer abc123');
  });

  it('expands an undefined variable to empty, never leaving the literal in place', () => {
    const config = createMcpServerConfig(
      {
        name: 'github',
        scope: 'user',
        folderPath: null,
        transport: 'stdio',
        command: 'npx',
        env: [{ name: 'GITHUB_TOKEN', value: '${MISSING}' }],
      },
      DIALECT,
    );

    const mapped = toSdkMcpServerConfig(config, {});
    expect(mapped.type === 'stdio' && mapped.env?.['GITHUB_TOKEN']).toBe('');
  });

  it('maps a remote (http) server, with header values present', () => {
    const config = createMcpServerConfig(
      {
        name: 'metrics',
        scope: 'user',
        folderPath: null,
        transport: 'http',
        url: 'https://mcp.example.com',
        headers: [{ name: 'Authorization', value: 'Bearer secret-token' }],
      },
      DIALECT,
    );

    expect(toSdkMcpServerConfig(config, {})).toEqual({
      type: 'http',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer secret-token' },
    });
  });

  it('maps a remote (sse) server', () => {
    const config = createMcpServerConfig(
      {
        name: 'metrics',
        scope: 'user',
        folderPath: null,
        transport: 'sse',
        url: 'https://mcp.example.com',
      },
      DIALECT,
    );

    expect(toSdkMcpServerConfig(config, {}).type).toBe('sse');
  });

  // `createMcpServerConfig` never builds either of these — `command`/`url` are typed nullable only
  // because the two transports share one interface. Built by hand, bypassing the domain factory, to
  // reach the defensive guard directly (same approach as `encryptedRowOf`, plan 13, D-38).
  it('refuses a stdio server with no command — a bug reaching this function, never the domain', () => {
    const broken: McpServerConfig = {
      name: 'github',
      scope: 'user',
      folderPath: null,
      transport: 'stdio',
      command: null,
      args: [],
      env: [],
      url: null,
      headers: [],
    };

    expect(() => toSdkMcpServerConfig(broken, {})).toThrow(/no command/);
  });

  it('refuses a remote server with no url — a bug reaching this function, never the domain', () => {
    const broken: McpServerConfig = {
      name: 'metrics',
      scope: 'user',
      folderPath: null,
      transport: 'http',
      command: null,
      args: [],
      env: [],
      url: null,
      headers: [],
    };

    expect(() => toSdkMcpServerConfig(broken, {})).toThrow(/no url/);
  });
});
