import { describe, expect, it } from 'vitest';

import {
  BRACE,
  MUSTACHE,
  compareCatalogues,
  emittedMessageKeys,
  findOrphans,
  findUntranslated,
  flatten,
  fromArb,
  mergeUsage,
  paramsOf,
  usageInDart,
  usageInLiterals,
  usageInTypeScript,
} from '../../../scripts/lib/i18n.mjs';

/**
 * @param {string} locale
 * @param {Record<string, string>} entries
 */
function catalogue(locale, entries) {
  return { locale, entries: new Map(Object.entries(entries)) };
}

describe('flatten', () => {
  it('turns a nested catalogue into dotted keys', () => {
    expect([...flatten({ common: { action: { retry: 'Try again' } } })]).toEqual([
      ['common.action.retry', 'Try again'],
    ]);
  });

  it('ignores anything that is not a string leaf', () => {
    expect([...flatten({ a: 1, b: null, c: 'text' })]).toEqual([['c', 'text']]);
    expect([...flatten('not an object')]).toEqual([]);
  });
});

describe('fromArb', () => {
  it('reads the keys and drops the @ metadata the tool writes beside them', () => {
    const arb = { '@@locale': 'en', appTitle: 'remote-claude', '@appTitle': { description: 'x' } };

    expect([...fromArb(arb)]).toEqual([['appTitle', 'remote-claude']]);
  });
});

describe('paramsOf', () => {
  it('reads the mustache form the web uses', () => {
    expect([...paramsOf('Trace {{traceId}} at {{ at }}', MUSTACHE)]).toEqual(['traceId', 'at']);
  });

  it('reads the brace form ARB uses', () => {
    expect([...paramsOf('Pong {count} at {at}', BRACE)]).toEqual(['count', 'at']);
  });

  it('answers nothing for a sentence that interpolates nothing', () => {
    expect([...paramsOf('Sign in', MUSTACHE)]).toEqual([]);
  });
});

describe('compareCatalogues', () => {
  it('accepts two catalogues that agree', () => {
    expect(
      compareCatalogues(
        [
          catalogue('en', { greeting: 'Hi {{name}}' }),
          catalogue('pt-BR', { greeting: 'Oi {{name}}' }),
        ],
        MUSTACHE,
      ),
    ).toEqual([]);
  });

  // S-05 — a key present in `en` and absent from `pt-BR`.
  it('reports a key the other language never got', () => {
    const problems = compareCatalogues(
      [catalogue('en', { a: 'A', b: 'B' }), catalogue('pt-BR', { a: 'A' })],
      MUSTACHE,
    );

    expect(problems).toEqual([{ kind: 'missing', key: 'b', detail: 'absent from pt-BR' }]);
  });

  // S-08 — the placeholder exists in one language and not in the other.
  it('reports a placeholder that does not survive the translation', () => {
    const problems = compareCatalogues(
      [
        catalogue('en', { path: '{{path}} is not allowed' }),
        catalogue('pt-BR', { path: 'Não permitido' }),
      ],
      MUSTACHE,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('params');
    expect(problems[0]?.detail).toContain('path');
  });

  it('does not mind the order the placeholders appear in — word order changes', () => {
    expect(
      compareCatalogues(
        [
          catalogue('en', { line: '{{a}} then {{b}}' }),
          catalogue('pt-BR', { line: '{{b}} depois {{a}}' }),
        ],
        MUSTACHE,
      ),
    ).toEqual([]);
  });

  it('reports a key that exists only in the translation', () => {
    expect(
      compareCatalogues([catalogue('en', {}), catalogue('pt-BR', { ghost: 'x' })], MUSTACHE),
    ).toEqual([{ kind: 'extra', key: 'ghost', detail: 'only in pt-BR' }]);
  });

  it('has nothing to say about an empty set', () => {
    expect(compareCatalogues([], MUSTACHE)).toEqual([]);
  });
});

describe('findOrphans', () => {
  // S-06 — a key declared and never used.
  it('reports a key nobody names', () => {
    expect(
      findOrphans(['used', 'forgotten'], { keys: new Set(['used']), prefixes: new Set() }),
    ).toEqual([{ kind: 'orphan', key: 'forgotten', detail: 'declared, never used' }]);
  });

  it('counts a key reached through an interpolated name as used', () => {
    const usage = { keys: new Set(), prefixes: new Set(['connection.status.']) };

    expect(findOrphans(['connection.status.ready', 'connection.status.idle'], usage)).toEqual([]);
  });
});

describe('reading what a source names', () => {
  it('finds the static form of a translation call', () => {
    const usage = usageInTypeScript('t(\'session.ping.title\') and t("auth.signIn.action")');

    expect([...usage.keys].sort()).toEqual(['auth.signIn.action', 'session.ping.title']);
  });

  it('finds the interpolated form as a prefix', () => {
    const usage = usageInTypeScript('t(`connection.status.${status}`)');

    expect([...usage.prefixes]).toEqual(['connection.status.']);
  });

  it('finds a Dart getter, however the catalogue was reached', () => {
    const usage = usageInDart('l10n.sessionPingTitle; AppLocalizations.of(context).appTitle;');

    expect([...usage.keys].sort()).toEqual(['appTitle', 'sessionPingTitle']);
  });

  it('finds a key named as a plain string, which is how the backend sends one', () => {
    const usage = usageInLiterals("messageKey: 'session.error.notFound'");

    expect([...usage.keys]).toEqual(['session.error.notFound']);
  });

  it('does not mistake a two-segment string for a key', () => {
    expect([...usageInLiterals("import x from './a.b'").keys]).toEqual([]);
  });

  it('merges what several sources name', () => {
    const merged = mergeUsage([
      { keys: new Set(['a']), prefixes: new Set(['p.']) },
      { keys: new Set(['b']), prefixes: new Set() },
    ]);

    expect([...merged.keys].sort()).toEqual(['a', 'b']);
    expect([...merged.prefixes]).toEqual(['p.']);
  });
});

describe('the keys the backend sends — plan 06, S-01', () => {
  const domainError = [
    'export class WorkspaceDirectoryUnreadableError extends DomainError {',
    "  readonly code = 'WORKSPACE_DIRECTORY_UNREADABLE';",
    "  readonly messageKey = 'workspace.error.directoryUnreadable';",
    '}',
  ].join('\n');

  it('reads the key a domain error declares, and the one a table of refusals names', () => {
    const table =
      'const BY_STATUS = { 400: { code: \'INVALID_INPUT\', messageKey: "common.error.invalidInput" } };';

    expect([...emittedMessageKeys(domainError)]).toEqual(['workspace.error.directoryUnreadable']);
    expect([...emittedMessageKeys(table)]).toEqual(['common.error.invalidInput']);
  });

  it('does not take a code, a comment about keys, or a key built at runtime for a key', () => {
    const source = [
      "readonly code = 'WORKSPACE_NOT_FOUND';",
      '// the messageKey is what the client translates',
      'const messageKey = known ? error.messageKey : INTERNAL.messageKey;',
      'return { messageKey, traceId };',
    ].join('\n');

    expect([...emittedMessageKeys(source)]).toEqual([]);
  });

  it('fails a code whose key the source catalogue lacks', () => {
    const en = catalogue('en', { 'workspace.error.notFound': '{{path}} does not exist.' });

    expect(findUntranslated(en.entries, emittedMessageKeys(domainError))).toEqual([
      {
        kind: 'untranslated',
        key: 'workspace.error.directoryUnreadable',
        detail: 'the backend sends it as a messageKey, and no catalogue translates it',
      },
    ]);
  });

  it('passes it once `en` carries it, and leaves the other language to the parity check', () => {
    const en = catalogue('en', { 'workspace.error.directoryUnreadable': '{{path}} is locked.' });
    const pt = catalogue('pt-BR', {});

    expect(findUntranslated(en.entries, emittedMessageKeys(domainError))).toEqual([]);
    // In `en` and not in `pt-BR` is still a failure — the one parity reports.
    expect(compareCatalogues([en, pt], MUSTACHE).map((problem) => problem.kind)).toEqual([
      'missing',
    ]);
  });

  it('reports a key sent from many places once, in a stable order', () => {
    const en = catalogue('en', {});

    expect(findUntranslated(en.entries, ['b.c.d', 'a.b.c', 'b.c.d']).map((p) => p.key)).toEqual([
      'a.b.c',
      'b.c.d',
    ]);
  });
});
