import { describe, expect, it } from 'vitest';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

import { realQueryFactory, UnsafeSdkOptionsError } from '@adapter/outbound/claude/query.factory';

/** An input that ends immediately, so the subprocess is never asked for anything. */
const nothing: AsyncIterable<never> = {
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ value: undefined, done: true }),
  }),
};

/** Options that are safe to open a session with: all three protections present. */
const safe: Options = {
  settingSources: ['project'],
  hooks: { PreToolUse: [{ hooks: [() => Promise.resolve({ continue: true })] }] },
  canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'no' }),
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

  it.each(['settingSources', 'hooks', 'canUseTool'] as const)(
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
});
