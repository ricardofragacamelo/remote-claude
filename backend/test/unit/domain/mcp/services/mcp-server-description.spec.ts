import { describe, expect, it } from 'vitest';

import { createMcpServerConfig, describeMcpServer } from '@domain/mcp';
import type { McpEngineDialect, McpServerInput } from '@domain/mcp';

const DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: () => null,
  reservedEnvNames: [],
};

describe('describeMcpServer — plan 13, B-18, S-68', () => {
  it('describes a stdio server with the command, args, scope and env names — never values', () => {
    const input: McpServerInput = {
      name: 'github',
      scope: 'folder',
      folderPath: '/home/user/project',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
      env: [{ name: 'GITHUB_TOKEN', value: 'super-secret-value' }],
    };
    const description = describeMcpServer(createMcpServerConfig(input, DIALECT));

    expect(description.messageKey).toBe('mcp.description.stdioFolder');
    expect(description.params).toMatchObject({
      command: 'npx',
      args: '-y server-github',
      folder: '/home/user/project',
      envCount: 1,
      envNames: 'GITHUB_TOKEN',
    });
    expect(JSON.stringify(description)).not.toContain('super-secret-value');
  });

  it('describes a user-scope server as applying to any folder', () => {
    const input: McpServerInput = {
      name: 'github',
      scope: 'user',
      folderPath: null,
      transport: 'stdio',
      command: 'npx',
    };
    const description = describeMcpServer(createMcpServerConfig(input, DIALECT));
    expect(description.messageKey).toBe('mcp.description.stdioAnyFolder');
    expect(description.params.folder).toBe('');
  });

  it('describes a remote server with the url, transport and header names — never values', () => {
    const input: McpServerInput = {
      name: 'metrics',
      scope: 'folder',
      folderPath: '/home/user/project',
      transport: 'sse',
      url: 'https://mcp.example.com',
      headers: [{ name: 'Authorization', value: 'Bearer super-secret-token' }],
    };
    const description = describeMcpServer(createMcpServerConfig(input, DIALECT));

    expect(description.messageKey).toBe('mcp.description.remoteFolder');
    expect(description.params).toMatchObject({
      transport: 'sse',
      url: 'https://mcp.example.com',
      headerCount: 1,
      headerNames: 'Authorization',
    });
    expect(JSON.stringify(description)).not.toContain('super-secret-token');
  });

  it('describes a user-scope remote server as applying to any folder', () => {
    const input: McpServerInput = {
      name: 'metrics',
      scope: 'user',
      folderPath: null,
      transport: 'sse',
      url: 'https://mcp.example.com',
    };
    const description = describeMcpServer(createMcpServerConfig(input, DIALECT));
    expect(description.messageKey).toBe('mcp.description.remoteAnyFolder');
    expect(description.params.folder).toBe('');
  });

  it('defends against a stdio config with no command — never throws, falls back to empty', () => {
    const config = {
      name: 'x',
      scope: 'user' as const,
      folderPath: null,
      transport: 'stdio' as const,
      command: null,
      args: [],
      env: [],
      url: null,
      headers: [],
    };
    expect(describeMcpServer(config).params.command).toBe('');
  });

  it('defends against a remote config with no URL — never throws, falls back to empty', () => {
    const config = {
      name: 'x',
      scope: 'user' as const,
      folderPath: null,
      transport: 'http' as const,
      command: null,
      args: [],
      env: [],
      url: null,
      headers: [],
    };
    expect(describeMcpServer(config).params.url).toBe('');
  });

  it('is idempotent: the same config always yields the exact same description (preview === saved)', () => {
    const input: McpServerInput = {
      name: 'github',
      scope: 'user',
      folderPath: null,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'x'],
      env: [{ name: 'TOKEN', value: 'a' }],
    };
    const config = createMcpServerConfig(input, DIALECT);
    expect(describeMcpServer(config)).toEqual(describeMcpServer(config));
    expect(describeMcpServer(createMcpServerConfig(input, DIALECT))).toEqual(
      describeMcpServer(createMcpServerConfig(input, DIALECT)),
    );
  });
});
