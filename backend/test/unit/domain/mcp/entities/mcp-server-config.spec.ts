import { describe, expect, it } from 'vitest';

import { createMcpServerConfig, MCP_LIMITS, McpServerConfigInvalidError } from '@domain/mcp';
import type { McpEngineDialect, McpServerInput } from '@domain/mcp';

/** An engine with no opinion beyond the universal rules — most tests don't need a real dialect. */
const PERMISSIVE_DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: () => null,
  reservedEnvNames: [],
};

/** The Claude dialect, as B-18 describes it: refuses `__`, reserves `CLAUDE_CONFIG_DIR`. */
const CLAUDE_DIALECT: McpEngineDialect = {
  engine: 'claude',
  rejectsServerName: (name) => (name.includes('__') ? 'nameAmbiguousForEngine' : null),
  reservedEnvNames: ['CLAUDE_CONFIG_DIR'],
};

function stdio(overrides: Partial<McpServerInput> = {}): McpServerInput {
  return {
    name: 'github',
    scope: 'user',
    folderPath: null,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'server-github'],
    env: [{ name: 'GITHUB_TOKEN', value: 'secret' }],
    ...overrides,
  };
}

function remote(overrides: Partial<McpServerInput> = {}): McpServerInput {
  return {
    name: 'metrics',
    scope: 'folder',
    folderPath: '/home/user/project',
    transport: 'http',
    url: 'https://mcp.example.com',
    headers: [{ name: 'Authorization', value: 'Bearer xyz' }],
    ...overrides,
  };
}

function invalidRule(action: () => unknown): { rule: string; field: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof McpServerConfigInvalidError) {
      return error.params as { rule: string; field: string };
    }
    throw error;
  }
  throw new Error('expected McpServerConfigInvalidError');
}

describe('createMcpServerConfig — plan 13, B-18', () => {
  describe('S-63 — the three transports, each accepted', () => {
    it('accepts stdio with command, args and env', () => {
      const config = createMcpServerConfig(stdio(), PERMISSIVE_DIALECT);
      expect(config).toMatchObject({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server-github'],
        env: [{ name: 'GITHUB_TOKEN', value: 'secret' }],
        url: null,
        headers: [],
      });
    });

    it('accepts http with url and headers', () => {
      const config = createMcpServerConfig(remote({ transport: 'http' }), PERMISSIVE_DIALECT);
      expect(config).toMatchObject({
        transport: 'http',
        url: 'https://mcp.example.com',
        headers: [{ name: 'Authorization', value: 'Bearer xyz' }],
        command: null,
        args: [],
        env: [],
      });
    });

    it('accepts sse with url and headers', () => {
      const config = createMcpServerConfig(remote({ transport: 'sse' }), PERMISSIVE_DIALECT);
      expect(config.transport).toBe('sse');
    });
  });

  describe('S-64 — a name the universal rule or the engine refuses', () => {
    it.each([[''], ['a'.repeat(65)], ['bad name'], ['bad/name']])(
      'rejects %j as MCP_SERVER_CONFIG_INVALID at name',
      (name) => {
        expect(() => createMcpServerConfig(stdio({ name }), PERMISSIVE_DIALECT)).toThrow(
          McpServerConfigInvalidError,
        );
        expect(
          invalidRule(() => createMcpServerConfig(stdio({ name }), PERMISSIVE_DIALECT)),
        ).toEqual({ rule: 'nameFormat', field: 'name' });
      },
    );

    it('rejects a name the engine refuses, after the universal pattern passes (Claude: `__`)', () => {
      expect(
        invalidRule(() => createMcpServerConfig(stdio({ name: 'github__tool' }), CLAUDE_DIALECT)),
      ).toEqual({ rule: 'nameAmbiguousForEngine', field: 'name' });
    });

    it('accepts a name the engine has no objection to', () => {
      expect(() => createMcpServerConfig(stdio({ name: 'github' }), CLAUDE_DIALECT)).not.toThrow();
    });
  });

  describe('S-65 — transport mismatch and URL scheme', () => {
    it('rejects a URL outside http(s) — file:', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(remote({ url: 'file:///etc/passwd' }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'urlScheme', field: 'url' });
    });

    it('rejects a URL outside http(s) — javascript:', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(remote({ url: 'javascript:alert(1)' }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'urlScheme', field: 'url' });
    });

    it('rejects stdio without a command', () => {
      expect(
        invalidRule(() => createMcpServerConfig(stdio({ command: null }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'commandRequired', field: 'command' });
    });

    it('rejects stdio with a url set', () => {
      expect(
        invalidRule(() => createMcpServerConfig(stdio({ url: 'https://x' }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'urlNotAllowed', field: 'url' });
    });

    it('rejects stdio with headers set', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ headers: [{ name: 'X', value: 'y' }] }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'headersNotAllowed', field: 'headers' });
    });

    it('rejects http with a command set', () => {
      expect(
        invalidRule(() => createMcpServerConfig(remote({ command: 'npx' }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'commandNotAllowed', field: 'command' });
    });

    it('rejects http with env set', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(remote({ env: [{ name: 'X', value: 'y' }] }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'envNotAllowed', field: 'env' });
    });

    it('rejects http with args set', () => {
      expect(
        invalidRule(() => createMcpServerConfig(remote({ args: ['x'] }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'argsNotAllowed', field: 'args' });
    });
  });

  describe('S-66 — env overlapping a sensitive or engine-reserved variable', () => {
    it.each([['LD_PRELOAD'], ['LD_LIBRARY_PATH'], ['NODE_OPTIONS'], ['DYLD_INSERT_LIBRARIES']])(
      'rejects env named %s',
      (name) => {
        expect(
          invalidRule(() =>
            createMcpServerConfig(stdio({ env: [{ name, value: 'x' }] }), PERMISSIVE_DIALECT),
          ),
        ).toEqual({ rule: 'envReserved', field: 'env' });
      },
    );

    it('rejects REMOTE_CLAUDE_* by prefix', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ env: [{ name: 'REMOTE_CLAUDE_OWNER', value: 'x' }] }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'envReserved', field: 'env' });
    });

    it('rejects a name the engine reserves (Claude: CLAUDE_CONFIG_DIR)', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ env: [{ name: 'CLAUDE_CONFIG_DIR', value: '/tmp' }] }),
            CLAUDE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'envReserved', field: 'env' });
    });

    it('accepts the same name for an engine that does not reserve it', () => {
      expect(() =>
        createMcpServerConfig(
          stdio({ env: [{ name: 'CLAUDE_CONFIG_DIR', value: '/tmp' }] }),
          PERMISSIVE_DIALECT,
        ),
      ).not.toThrow();
    });
  });

  describe('S-67 — caps on args, env and headers', () => {
    it('accepts exactly the cap of args, and rejects one above', () => {
      const atCap = Array.from({ length: MCP_LIMITS.maxArgs }, (_, i) => `a${i}`);
      expect(() => createMcpServerConfig(stdio({ args: atCap }), PERMISSIVE_DIALECT)).not.toThrow();

      const overCap = [...atCap, 'one-too-many'];
      expect(
        invalidRule(() => createMcpServerConfig(stdio({ args: overCap }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'tooManyArgs', field: 'args' });
    });

    it('accepts exactly the cap of env vars, and rejects one above', () => {
      const atCap = Array.from({ length: MCP_LIMITS.maxEnvVars }, (_, i) => ({
        name: `VAR_${i}`,
        value: 'x',
      }));
      expect(() => createMcpServerConfig(stdio({ env: atCap }), PERMISSIVE_DIALECT)).not.toThrow();

      const overCap = [...atCap, { name: 'ONE_TOO_MANY', value: 'x' }];
      expect(
        invalidRule(() => createMcpServerConfig(stdio({ env: overCap }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'tooManyEnvVars', field: 'env' });
    });

    it('accepts exactly the cap of headers, and rejects one above', () => {
      const atCap = Array.from({ length: MCP_LIMITS.maxHeaders }, (_, i) => ({
        name: `X-Header-${i}`,
        value: 'x',
      }));
      expect(() =>
        createMcpServerConfig(remote({ headers: atCap }), PERMISSIVE_DIALECT),
      ).not.toThrow();

      const overCap = [...atCap, { name: 'X-One-Too-Many', value: 'x' }];
      expect(
        invalidRule(() => createMcpServerConfig(remote({ headers: overCap }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'tooManyHeaders', field: 'headers' });
    });

    it('rejects an env value over the length cap', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ env: [{ name: 'X', value: 'a'.repeat(MCP_LIMITS.maxEnvValueLength + 1) }] }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'envValueTooLong', field: 'env' });
    });

    it('rejects a header value over the length cap', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            remote({
              headers: [{ name: 'X', value: 'a'.repeat(MCP_LIMITS.maxHeaderValueLength + 1) }],
            }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'headerValueTooLong', field: 'headers' });
    });

    it('rejects a duplicate env name', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({
              env: [
                { name: 'X', value: '1' },
                { name: 'X', value: '2' },
              ],
            }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'envNameDuplicate', field: 'env' });
    });

    it('rejects a duplicate header name, case-insensitively', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            remote({
              headers: [
                { name: 'Authorization', value: '1' },
                { name: 'authorization', value: '2' },
              ],
            }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'headerNameDuplicate', field: 'headers' });
    });
  });

  describe('defensive checks below the universal rules', () => {
    it('rejects a scope outside the known set', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(stdio({ scope: 'bogus' as never }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'scopeUnknown', field: 'scope' });
    });

    it('rejects a transport outside the known set', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(stdio({ transport: 'bogus' as never }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'transportUnknown', field: 'transport' });
    });

    it('rejects a single arg over the length cap', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ args: ['a'.repeat(MCP_LIMITS.maxArgLength + 1)] }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'argTooLong', field: 'args' });
    });

    it('rejects an env name that is not a valid identifier', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(stdio({ env: [{ name: '1BAD', value: 'x' }] }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'envNameFormat', field: 'env' });
    });

    it('rejects a header name outside the HTTP token grammar', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            remote({ headers: [{ name: 'bad header', value: 'x' }] }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'headerNameFormat', field: 'headers' });
    });

    it('rejects a command over the length cap', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ command: 'a'.repeat(MCP_LIMITS.maxCommandLength + 1) }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'commandTooLong', field: 'command' });
    });

    it('rejects a URL over the length cap', () => {
      const long = `https://example.com/${'a'.repeat(MCP_LIMITS.maxUrlLength)}`;
      expect(
        invalidRule(() => createMcpServerConfig(remote({ url: long }), PERMISSIVE_DIALECT)),
      ).toEqual({ rule: 'urlTooLong', field: 'url' });
    });

    it('rejects a remote server with no URL at all — falls back to empty, then invalid', () => {
      const input: McpServerInput = {
        name: 'metrics',
        scope: 'user',
        folderPath: null,
        transport: 'http',
      };
      expect(invalidRule(() => createMcpServerConfig(input, PERMISSIVE_DIALECT))).toEqual({
        rule: 'urlInvalid',
        field: 'url',
      });
    });

    it('accepts a remote server with no headers at all — defaults to none', () => {
      const input: McpServerInput = {
        name: 'metrics',
        scope: 'user',
        folderPath: null,
        transport: 'http',
        url: 'https://mcp.example.com',
      };
      const config = createMcpServerConfig(input, PERMISSIVE_DIALECT);
      expect(config.headers).toEqual([]);
    });
  });

  describe('scope', () => {
    it('requires a folder for scope folder', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(stdio({ scope: 'folder', folderPath: null }), PERMISSIVE_DIALECT),
        ),
      ).toEqual({ rule: 'folderRequired', field: 'folderPath' });
    });

    it('forbids a folder for scope user', () => {
      expect(
        invalidRule(() =>
          createMcpServerConfig(
            stdio({ scope: 'user', folderPath: '/home/user' }),
            PERMISSIVE_DIALECT,
          ),
        ),
      ).toEqual({ rule: 'folderNotAllowed', field: 'folderPath' });
    });
  });
});
