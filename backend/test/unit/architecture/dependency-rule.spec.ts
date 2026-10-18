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

  // The exception the push adapter carries: `jose` is a crypto primitive, and signing an
  // assertion is not knowing what OIDC is.
  it('allows the push adapter the same crypto library, and nothing more', async () => {
    expect(
      broke(await violations(), 'identity-is-isolated', 'adapter/outbound/push/allowed.ts'),
    ).toBe(false);
    expect(
      broke(await violations(), 'push-does-not-learn-oidc', 'adapter/outbound/push/allowed.ts'),
    ).toBe(false);
  });

  // Plan 04: the history is read by the SDK's functions, never by a parser of ours.
  it('refuses a transcript adapter that opens the JSONL itself — S-09', async () => {
    const found = await violations();

    expect(
      broke(
        found,
        'transcript-reads-through-the-sdk',
        'adapter/outbound/engines/claude/transcript-parser.ts',
      ),
    ).toBe(true);
    expect(
      broke(found, 'transcript-reads-through-the-sdk', 'application/transcript/reads-the-file.ts'),
    ).toBe(true);
  });

  it('refuses a line reader anywhere, which is how a JSONL parser begins — S-09', async () => {
    const found = await violations();

    expect(broke(found, 'no-line-reader', 'shared/line-reader.ts')).toBe(true);
    expect(
      broke(found, 'no-line-reader', 'adapter/outbound/engines/claude/transcript-parser.ts'),
    ).toBe(true);
  });

  it('leaves the filesystem to the rest of the backend, outside the transcript slice', async () => {
    // The checkpoint store writes blobs to disk, and that is its job: the rule is about the
    // transcript, not about `fs`.
    expect(
      broke(await violations(), 'transcript-reads-through-the-sdk', 'shared/line-reader.ts'),
    ).toBe(false);
  });

  it('refuses persistence reaching what reads a conversation — plan 04, S-28', async () => {
    expect(
      broke(
        await violations(),
        'transcript-is-never-persisted',
        'adapter/outbound/persistence/copies-the-transcript.ts',
      ),
    ).toBe(true);
  });

  it('lets the transcript read its own store, which is not persisting it', async () => {
    expect(
      broke(
        await violations(),
        'transcript-is-never-persisted',
        'application/transcript/reads-the-file.ts',
      ),
    ).toBe(false);
  });

  it('refuses `files` reaching `session`, even through its barrel — plan 07, S-08', async () => {
    expect(
      broke(
        await violations(),
        'files-never-reaches-session',
        'application/files/reaches-session.ts',
      ),
    ).toBe(true);
  });

  it('refuses the engine settings reaching `session`, even through its barrel — plan 28, B-36', async () => {
    expect(
      broke(
        await violations(),
        'settings-never-reach-session',
        'application/agent-settings/reaches-session.ts',
      ),
    ).toBe(true);
  });

  it('refuses the engine settings importing the SDK outside the Claude adapter — plan 28, B-36', async () => {
    expect(
      broke(
        await violations(),
        'sdk-is-isolated',
        'application/agent-settings/talks-to-the-sdk.ts',
      ),
    ).toBe(true);
  });

  it('lets `files` reach `workspace` through its barrel — plan 07, D-01', async () => {
    const found = await violations();

    expect(
      broke(found, 'files-never-reaches-session', 'adapter/outbound/files/reaches-workspace.ts'),
    ).toBe(false);
    expect(
      broke(found, 'no-cross-domain-internals', 'adapter/outbound/files/reaches-workspace.ts'),
    ).toBe(false);
  });

  it('refuses the core importing an engine extension — plan 28, S-17', async () => {
    expect(
      broke(
        await violations(),
        'engine-extension-is-isolated',
        'application/session/imports-an-engine.ts',
      ),
    ).toBe(true);
  });

  it('lets the composition import the extension it wires — plan 28, S-18', async () => {
    const found = await violations();

    expect(
      broke(
        found,
        'engine-extension-is-isolated',
        'infrastructure/modules/engines/claude.module.ts',
      ),
    ).toBe(false);
    expect(
      broke(found, 'engine-extension-is-isolated', 'adapter/outbound/engines/claude/adapter.ts'),
    ).toBe(false);
  });

  it('refuses one engine extension importing another — plan 28, S-19', async () => {
    expect(
      broke(
        await violations(),
        'engines-do-not-know-each-other',
        'adapter/outbound/engines/other/knows-claude.ts',
      ),
    ).toBe(true);
  });

  it('refuses an adapter reaching into the adapter of an engine — plan 28, S-22', async () => {
    expect(
      broke(
        await violations(),
        'adapters-do-not-know-each-other',
        'adapter/outbound/notification/knows-the-engine.ts',
      ),
    ).toBe(true);
  });

  it('holds with no exception, the two imports of before refused like any other — plan 28, B-34', async () => {
    const found = await violations();
    const guarded = new Set(['adapters-do-not-know-each-other', 'engine-extension-is-isolated']);
    const excepted = (configuration.forbidden ?? [])
      .filter((each) => guarded.has(each.name ?? ''))
      .flatMap((each) => [each.from.pathNot ?? []].flat())
      .filter((path) => path.endsWith('$'));

    expect(excepted).toEqual([]);
    for (const file of [
      'adapter/outbound/diag/installation-versions.reader.ts',
      'adapter/outbound/permission/permission-resolved.listeners.ts',
    ]) {
      expect(broke(found, 'adapters-do-not-know-each-other', file), file).toBe(true);
      expect(broke(found, 'engine-extension-is-isolated', file), file).toBe(true);
    }
  });

  it('refuses production composition importing the test engine — plan 28, B-43, S-121', async () => {
    expect(
      broke(
        await violations(),
        'no-test-engine-in-production',
        'infrastructure/modules/engines/imports-test-engine.ts',
      ),
    ).toBe(true);
  });

  it('refuses the SDK at the old home of the adapter, now that it moved — plan 28, S-31', async () => {
    expect(
      broke(await violations(), 'sdk-is-isolated', 'adapter/outbound/claude/talks-to-the-sdk.ts'),
    ).toBe(true);
  });

  it('lets the SDK into the adapter of its engine at its new home — plan 28, B-06', async () => {
    expect(
      broke(
        await violations(),
        'sdk-is-isolated',
        'adapter/outbound/engines/claude/talks-to-the-sdk.ts',
      ),
    ).toBe(false);
  });

  it('carries a comment on every rule, so a failure says why the rule exists', () => {
    for (const rule of configuration.forbidden ?? []) {
      expect(rule.comment, rule.name).toBeTruthy();
    }
  });
});
