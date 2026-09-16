import { describe, expect, it, vi } from 'vitest';
import { cruise } from 'dependency-cruiser';
import type { ICruiseOptions, ICruiseResult, IConfiguration } from 'dependency-cruiser';

import configuration from '../../../dependency-cruiser.config.mjs';

/** Where the deliberate violations live, laid out the way `src/` is. */
const FIXTURES = 'test/support/architecture';

// Cruising a tree and resolving every dependency is not instant, and it is the tool being slow
// rather than the assertion being wrong.
vi.setConfig({ testTimeout: 60_000 });

/**
 * The same rules, pointed at the fixtures instead of at `src/`.
 *
 * Rewriting the anchor is what lets the real configuration be exercised: a test that restated the
 * rules would pass while the configuration the build actually uses was wrong.
 */
function rulesForFixtures(): ICruiseOptions {
  const rewritten = JSON.stringify(configuration).replaceAll('^src/', `^${FIXTURES}/`);
  const parsed = JSON.parse(rewritten) as IConfiguration;

  return {
    ...parsed.options,
    // The programmatic API takes the rules under `ruleSet` and only checks them when `validate`
    // is on. Getting either wrong produces a cruise that inspects everything and forbids nothing —
    // a gate that reports success because it never looked.
    validate: true,
    ruleSet: {
      // Orphans are the normal state of a fixture folder.
      forbidden: (parsed.forbidden ?? []).filter((rule) => rule.name !== 'no-orphans'),
    },
  };
}

/** Every rule the cruise found broken, by name. */
async function violations(): Promise<Set<string>> {
  const outcome = await cruise([FIXTURES], rulesForFixtures());
  const result = outcome.output as ICruiseResult;

  return new Set(
    result.modules.flatMap((module) =>
      module.dependencies.flatMap((dependency) =>
        (dependency.rules ?? []).map((rule) => `${rule.name}:${module.source}`),
      ),
    ),
  );
}

/** Whether a rule fired on a given file. */
function broke(found: Set<string>, rule: string, file: string): boolean {
  return found.has(`${rule}:${FIXTURES}/${file}`);
}

describe('the Dependency Rule, as the build enforces it', () => {
  it('refuses a framework import inside domain/', async () => {
    expect(broke(await violations(), 'domain-is-pure', 'domain/session/framework-import.ts')).toBe(
      true,
    );
  });

  it('refuses a framework import inside application/', async () => {
    expect(
      broke(
        await violations(),
        'application-is-framework-free',
        'application/session/framework-import.ts',
      ),
    ).toBe(true);
  });

  it('refuses domain/ reaching outwards into application/', async () => {
    expect(
      broke(await violations(), 'no-outward-dependency', 'domain/session/outward-import.ts'),
    ).toBe(true);
  });

  it("refuses reaching into another domain's insides", async () => {
    expect(
      broke(await violations(), 'no-cross-domain-internals', 'domain/session/cross-domain-deep.ts'),
    ).toBe(true);
  });

  it('allows the same import through the barrel', async () => {
    expect(
      broke(
        await violations(),
        'no-cross-domain-internals',
        'domain/session/cross-domain-barrel.ts',
      ),
    ).toBe(false);
  });

  it('refuses identity knowledge outside its adapter', async () => {
    expect(
      broke(await violations(), 'identity-is-isolated', 'domain/session/identity-leak.ts'),
    ).toBe(true);
  });

  it('allows identity knowledge inside its adapter', async () => {
    expect(
      broke(await violations(), 'identity-is-isolated', 'adapter/outbound/identity/allowed.ts'),
    ).toBe(false);
  });

  it('carries a comment on every rule, so a failure says why the rule exists', () => {
    for (const rule of configuration.forbidden ?? []) {
      expect(rule.comment, rule.name).toBeTruthy();
    }
  });
});
