import { describe, expect, it } from 'vitest';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

import { realQueryFactory, UnsafeSdkOptionsError } from '@adapter/outbound/claude/query.factory';

/** An input that ends immediately, so the subprocess is never asked for anything. */
const nothing: AsyncIterable<never> = {
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ value: undefined, done: true }),
  }),
};

/** Options that are safe to open a session with: all four protections present. */
const safe: Options = {
  settingSources: ['project'],
  hooks: { PreToolUse: [{ hooks: [() => Promise.resolve({ continue: true })] }] },
  canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'no' }),
  env: { PATH: '/usr/bin', HOME: '/home/me', CLAUDE_CONFIG_DIR: '/home/me/.claude' },
  strictMcpConfig: true,
  mcpServers: {},
  settings: { disableSkillShellExecution: true, outputStyle: 'Concise' },
  plugins: [{ type: 'local', path: '/srv/plugin', skipMcpDiscovery: true }],
};

/**
 * The last place anything can be stopped before a subprocess exists.
 *
 * The SDK is lazy — nothing is spawned until the stream is pulled — so these exercise the guard
 * and the call without starting a process.
 */
describe('realQueryFactory', () => {
  it('opens a query when the options carry all three protections', () => {
    const query = realQueryFactory({ prompt: nothing, options: safe });

    expect(typeof query.interrupt).toBe('function');
    query.close();
  });

  it.each(['settingSources', 'hooks', 'canUseTool', 'env', 'strictMcpConfig'] as const)(
    'refuses to open a session when %s is absent altogether',
    (field) => {
      // Built by omission rather than by setting the field to `undefined`: with
      // `exactOptionalPropertyTypes` an absent property and an explicit `undefined` are different
      // types, and what the guard has to survive is the absent one.
      const options = Object.fromEntries(
        Object.entries(safe).filter(([name]) => name !== field),
      ) as Options;

      expect(() => realQueryFactory({ prompt: nothing, options })).toThrow(UnsafeSdkOptionsError);
    },
  );

  it.each([
    ['settingSources is empty', { settingSources: [] }],
    ['settingSources names the user scope', { settingSources: ['user'] }],
    ['settingSources also names another scope', { settingSources: ['project', 'user'] }],
  ] as [string, Options][])('refuses to open a session when %s', (_case, options) => {
    // Omitting it loads the user scope and its personal `allow` rules, which skip `canUseTool` —
    // with no error and no warning from the SDK. This is the error the SDK does not give.
    expect(() => realQueryFactory({ prompt: nothing, options: { ...safe, ...options } })).toThrow(
      UnsafeSdkOptionsError,
    );
  });

  it.each([
    ['PreToolUse is absent', { hooks: {} }],
    ['PreToolUse is empty', { hooks: { PreToolUse: [] } }],
    ['every matcher of PreToolUse is empty', { hooks: { PreToolUse: [{ hooks: [] }] } }],
  ] as [string, Options][])('refuses to open a session when %s', (_case, options) => {
    // Without the hook there is no trail of what was executed, on a backend that runs `Bash`.
    expect(() => realQueryFactory({ prompt: nothing, options: { ...safe, ...options } })).toThrow(
      UnsafeSdkOptionsError,
    );
  });

  it('refuses to open a session when canUseTool is not a function', () => {
    // Without it the CLI falls back to its own classification and runs whatever it considers
    // safe, with nobody asked. It is the product, switched off in silence.
    expect(() =>
      realQueryFactory({
        prompt: nothing,
        options: { ...safe, canUseTool: 'yes' as never },
      }),
    ).toThrow(UnsafeSdkOptionsError);
  });

  it.each([
    ['the connection string', { DATABASE_URL: 'postgres://user:secret@localhost/db' }],
    ['a compose password', { RC_POSTGRES_PASSWORD: 'secret' }],
    ['the identity provider configuration', { OIDC_ISSUER: 'http://localhost/realms/x' }],
    ['a libpq variable', { PGPASSWORD: 'secret' }],
  ])('refuses an env that carries %s — 12 · B-13', (_case, leak) => {
    // An env that carries the backend's configuration gives every `Bash` Claude runs the database
    // password. Nothing in the SDK complains.
    expect(() =>
      realQueryFactory({ prompt: nothing, options: { ...safe, env: { ...safe.env, ...leak } } }),
    ).toThrow(UnsafeSdkOptionsError);
  });

  it('names the leaked variables, and never their values', () => {
    expect.assertions(3);

    try {
      realQueryFactory({
        prompt: nothing,
        options: { ...safe, env: { ...safe.env, RC_POSTGRES_PASSWORD: 'the-real-password' } },
      });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('env');
      expect(message).toContain('RC_POSTGRES_PASSWORD');
      expect(message).not.toContain('the-real-password');
    }
  });

  it('says which of the three is missing, because they fail for different reasons', () => {
    expect.assertions(3);

    try {
      realQueryFactory({ prompt: nothing, options: { ...safe, settingSources: [] } });
    } catch (error) {
      expect((error as Error).message).toContain('settingSources');
    }

    try {
      realQueryFactory({ prompt: nothing, options: { ...safe, hooks: {} } });
    } catch (error) {
      expect((error as Error).message).toContain('PreToolUse');
    }

    try {
      realQueryFactory({
        prompt: nothing,
        options: { settingSources: safe.settingSources, hooks: safe.hooks } as Options,
      });
    } catch (error) {
      expect((error as Error).message).toContain('canUseTool');
    }
  });

  it.each([
    ['strictMcpConfig is false — S-06', { strictMcpConfig: false }],
    [
      'a server is on the argv — plan 13, D-02',
      { mcpServers: { gh: { command: 'npx', env: { GITHUB_TOKEN: 'secret' } } } },
    ],
    [
      'managedSettings is set — plan 13, D-24',
      { managedSettings: { disableSkillShellExecution: true } },
    ],
    ['settings is a file', { settings: '/tmp/settings.json' }],
    ['settings carries permissions — S-08', { settings: { permissions: { allow: ['Bash'] } } }],
    ['settings carries hooks — S-08', { settings: { hooks: {} } }],
    [
      'a plugin starts its own MCP servers — S-09',
      { plugins: [{ type: 'local', path: '/srv/p' }] },
    ],
  ] as [string, Options][])('refuses to open a session when %s — ADR-018', (_case, options) => {
    expect(() => realQueryFactory({ prompt: nothing, options: { ...safe, ...options } })).toThrow(
      UnsafeSdkOptionsError,
    );
  });

  it('names the flag settings it refused, and opens with no settings and no plugins at all', () => {
    expect(() =>
      realQueryFactory({
        prompt: nothing,
        options: { ...safe, settings: { enabledPlugins: {}, env: {} } },
      }),
    ).toThrow(/enabledPlugins, env/);

    const bare = Object.fromEntries(
      Object.entries(safe).filter(
        ([name]) => !['settings', 'plugins', 'mcpServers'].includes(name),
      ),
    ) as Options;
    const query = realQueryFactory({ prompt: nothing, options: bare });
    query.close();
  });
});
