import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  accessesIn,
  checkBaseline,
  grouped,
  hitsIn,
  jsonStrings,
  lex,
  remainingByPhase,
  scanFile,
  scopeOf,
  violationsIn,
  withoutExceptions,
  wordsOf,
  writtenBaseline,
} from '../../../scripts/lib/engine-neutrality.mjs';
import { repoRoot } from '../../../scripts/lib/paths.mjs';

/** The vocabulary the gate really reads: a test against a copy would pass while the file was wrong. */
const VOCABULARY = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'scripts', 'engine-vocabulary.json'), 'utf8'),
);

/** The terms found in a file of the tree, in order. @param {string} file @param {string} source */
const termsIn = (file, source) => scanFile(file, source, VOCABULARY).map((each) => each.term);

/**
 * A term of the vocabulary, written in a test.
 *
 * @param {Partial<import('../../../scripts/lib/engine-neutrality.mjs').VocabularyTerm>} fields
 * @returns {import('../../../scripts/lib/engine-neutrality.mjs').VocabularyTerm}
 */
const termOf = (fields) => ({ term: '', match: 'word', reason: '', home: '', ...fields });

/** A violation of [term] at [line] of [file]. */
const violation = (/** @type {string} */ file, /** @type {string} */ term, line = 1) => ({
  file,
  line,
  term,
  reason: 'r',
  home: 'h',
});

describe('neutral:check — what the gate reads (plan 28, B-04)', () => {
  it('fails a native tool name in a literal of the web core, with file, line, term and reason — S-05', () => {
    const found = scanFile(
      'web/src/features/session/lib/labels.ts',
      "const a = 1;\nif (name === 'Edit') {}\n",
      VOCABULARY,
    );

    expect(found).toEqual([
      {
        file: 'web/src/features/session/lib/labels.ts',
        line: 2,
        term: 'Edit',
        reason: 'a native tool name of Claude Code',
        home: 'the tool classifier — the core reads the kind',
      },
    ]);
  });

  it('passes the same literal inside an engine extension — S-06', () => {
    expect(scopeOf('web/src/engines/claude/labels.ts')).toBeNull();
    expect(scopeOf('backend/src/adapter/outbound/engines/claude/mapper.ts')).toBeNull();
    expect(scopeOf('mobile/lib/engines/claude/view.dart')).toBeNull();
    expect(termsIn('web/src/engines/claude/labels.ts', "name === 'Edit'")).toEqual([]);
  });

  it('fails `claude` in a key or an enum of a schema, and passes it as the value of `native` — S-07', () => {
    const schema = JSON.stringify({
      properties: {
        claudeSessionId: { type: 'string' },
        origin: { properties: { native: { const: 'Edit' } } },
        mode: { enum: ['ask', 'bypassPermissions'] },
      },
      examples: [{ engine: 'claude', native: 'Edit' }],
    });

    expect(termsIn('packages/contracts/schema/events/x.schema.json', schema)).toEqual([
      'claude',
      'bypassPermissions',
    ]);
  });

  it('fails "Claude" in the value of a core i18n key, and passes `{agent}` and an extension namespace — S-08', () => {
    const locale = JSON.stringify({
      session: { waiting: 'Claude is working', ready: '{agent} is ready' },
      engines: { claude: { title: 'Claude settings' } },
    });

    expect(termsIn('web/src/shared/i18n/locales/en.json', locale)).toEqual(['claude']);
    expect(
      termsIn(
        'mobile/lib/l10n/app_en.arb',
        '{"waiting": "{agent} works", "enginesClaudeTitle": "Claude", "@enginesClaudeTitle": {"description": "Claude"}}',
      ),
    ).toEqual([]);
  });

  it('passes every name of the product through the permanent list, and fails the engine beside it — S-09', () => {
    const source = [
      "import { x } from '@remote-claude/contracts';",
      "import 'package:remote_claude/core/a.dart';",
      'class RemoteClaudeApp {}',
      "const plugin = 'remote-claude-user';",
      "const channel = 'remote_claude/save';",
      'const claudeSessionId = 1;',
    ].join('\n');

    expect(termsIn('web/src/app/main.ts', source)).toEqual(['claude']);
    for (const exception of VOCABULARY.exceptions) {
      expect(exception.reason.length).toBeGreaterThan(10);
    }
  });

  it('never reads generated code, tests nor recorded fixtures — S-10', () => {
    for (const file of [
      'packages/contracts/src/protocol.ts',
      'web/src/shared/api/protocol.ts',
      'mobile/lib/core/network/contracts/protocol.g.dart',
      'mobile/lib/l10n/generated/app_localizations.dart',
      'mobile/lib/a.freezed.dart',
      'backend/test/unit/a.spec.ts',
      'web/test/unit/a.test.tsx',
      'backend/test/fakes/agent-sdk/fixtures/turn.json',
      'e2e/specs/a.spec.ts',
    ]) {
      expect(scopeOf(file), file).toBeNull();
    }
  });

  it('reads the code, the i18n and the schemas of the three ends', () => {
    expect(scopeOf('backend/src/domain/a.ts')).toEqual({ kind: 'code', language: 'ts' });
    expect(scopeOf('web/src/features/a/B.tsx')).toEqual({ kind: 'code', language: 'ts' });
    expect(scopeOf('mobile/lib/features/a.dart')).toEqual({ kind: 'code', language: 'dart' });
    expect(scopeOf('backend/src/shared/i18n/locales/pt-BR.json')).toEqual({
      kind: 'i18n',
      language: 'json',
    });
    expect(scopeOf('packages/contracts/schema/definitions/a.schema.json')).toEqual({
      kind: 'schema',
      language: 'json',
    });
  });
});

describe('neutral:check — the lexer', () => {
  it('tells identifiers, strings and comments apart, with their lines', () => {
    expect(lex("// a\nconst b = 'c';\n/* d\n e */ f", 'ts')).toEqual([
      { kind: 'comment', text: ' a', line: 1 },
      { kind: 'identifier', text: 'const', line: 2 },
      { kind: 'identifier', text: 'b', line: 2 },
      { kind: 'string', text: 'c', line: 2 },
      { kind: 'comment', text: ' d\n e ', line: 3 },
      { kind: 'identifier', text: 'f', line: 4 },
    ]);
  });

  it('reads a template with an expression inside, and an escaped quote', () => {
    expect(lex("`a ${ {b: 1}.b } c` 'd\\'e' x", 'ts').map((token) => token.text)).toEqual([
      'a ${ {b: 1}.b } c',
      "d\\'e",
      'x',
    ]);
  });

  it('skips a regular expression, so its quote opens no string', () => {
    expect(lex("const r = /'[/]/g; const s = 'Edit';", 'ts').map((token) => token.text)).toEqual([
      'const',
      'r',
      'g',
      'const',
      's',
      'Edit',
    ]);
  });

  it('keeps a division a division', () => {
    expect(lex("a / b / 'c'", 'ts').map((token) => token.text)).toEqual(['a', 'b', 'c']);
  });

  it('reads the triple and the raw strings of Dart', () => {
    expect(lex("'''a\nb''' r'c\\' d", 'dart')).toEqual([
      { kind: 'string', text: 'a\nb', line: 1 },
      { kind: 'identifier', text: 'r', line: 2 },
      { kind: 'string', text: 'c\\', line: 2 },
      { kind: 'identifier', text: 'd', line: 2 },
    ]);
  });

  it('closes an unterminated string or comment at the end of the source', () => {
    expect(lex("'abc", 'ts')).toEqual([{ kind: 'string', text: 'abc', line: 1 }]);
    expect(lex('/* abc', 'ts')).toEqual([{ kind: 'comment', text: ' abc', line: 1 }]);
    expect(lex('// abc', 'ts')).toEqual([{ kind: 'comment', text: ' abc', line: 1 }]);
    expect(lex('/[a', 'ts')).toEqual([]);
  });

  it('has no comments nor single quotes in JSON', () => {
    expect(lex('{"a": "//b", "c\'": [1, "d"]}', 'json').map((token) => token.text)).toEqual([
      '{',
      'a',
      ':',
      '//b',
      ',',
      "c'",
      ':',
      '[',
      ',',
      'd',
      ']',
      '}',
    ]);
  });

  it('gives every string of a JSON document its path and its role', () => {
    const strings = jsonStrings(lex('{"a": {"b": "c", "d": ["e", {"f": "g"}]}, "h": "i"}', 'json'));

    expect(strings.map((each) => [each.role, each.path.join('.'), each.token.text])).toEqual([
      ['key', 'a', 'a'],
      ['key', 'a.b', 'b'],
      ['value', 'a.b', 'c'],
      ['key', 'a.d', 'd'],
      ['value', 'a.d', 'e'],
      ['key', 'a.d.f', 'f'],
      ['value', 'a.d.f', 'g'],
      ['key', 'h', 'h'],
      ['value', 'h', 'i'],
    ]);
  });
});

describe('neutral:check — how a term matches', () => {
  it('splits words at every non-letter and at the camel humps', () => {
    expect(wordsOf('claudeSessionId CLAUDE_TIMEOUT Claude’s HTTPServer')).toEqual([
      'claude',
      'session',
      'id',
      'claude',
      'timeout',
      'claude',
      's',
      'http',
      'server',
    ]);
  });

  it('matches a word in any case, and never inside another word', () => {
    const term = termOf({ term: 'claude', match: 'word' });
    expect(hitsIn({ kind: 'comment', text: 'Claude and claude', line: 1 }, term)).toBe(2);
    expect(hitsIn({ kind: 'identifier', text: 'claudette', line: 1 }, term)).toBe(0);
  });

  it('matches a token exactly, or by its prefix', () => {
    const exact = termOf({ term: 'old_string', match: 'token' });
    const prefix = termOf({ term: 'mcp__', match: 'token', prefix: true });
    expect(hitsIn({ kind: 'string', text: 'input.old_string', line: 1 }, exact)).toBe(1);
    expect(hitsIn({ kind: 'string', text: 'old_strings', line: 1 }, exact)).toBe(0);
    expect(hitsIn({ kind: 'string', text: 'mcp__srv__tool', line: 1 }, prefix)).toBe(1);
  });

  it('matches a literal only as a whole string, or as the head of a rule', () => {
    const term = termOf({ term: 'Bash', match: 'literal' });
    expect(hitsIn({ kind: 'string', text: 'Bash', line: 1 }, term)).toBe(1);
    expect(hitsIn({ kind: 'string', text: 'Bash(git status:*)', line: 1 }, term)).toBe(1);
    expect(hitsIn({ kind: 'string', text: 'Bashful', line: 1 }, term)).toBe(0);
    expect(hitsIn({ kind: 'identifier', text: 'Bash', line: 1 }, term)).toBe(0);
    expect(hitsIn({ kind: 'comment', text: 'Bash', line: 1 }, term)).toBe(0);
  });

  it('matches nothing with an unknown kind of match', () => {
    // @ts-expect-error — a vocabulary written by hand may carry a typo
    expect(hitsIn({ kind: 'string', text: 'x', line: 1 }, { term: 'x', match: 'regex' })).toBe(0);
  });

  it('blanks every name of the product before matching', () => {
    expect(withoutExceptions('remote-claude and claude', VOCABULARY.exceptions).trim()).toBe(
      'and claude',
    );
  });

  it('counts two violations on the same line twice, each with its term — S-16', () => {
    const found = violationsIn(
      'backend/src/a.ts',
      [{ kind: 'string', text: 'claude claude old_string', line: 4 }],
      VOCABULARY,
    );

    expect(found.map((each) => [each.term, each.line])).toEqual([
      ['claude', 4],
      ['claude', 4],
      ['old_string', 4],
    ]);
    expect([...grouped(found).values()].map((group) => [group.term, group.lines.length])).toEqual([
      ['claude', 2],
      ['old_string', 1],
    ]);
  });
});

describe('neutral:check — a value the core never opens (plan 28, D-04)', () => {
  const access = termOf({ term: 'rawInput', match: 'access', reason: 'opaque', home: 'label' });
  const vocabulary = { terms: [access], exceptions: [] };

  it('reports every field read of the term, by member, optional member and index', () => {
    const source = [
      'const a = tool.rawInput.todos;',
      'const b = tool.rawInput?.plan ?? request.rawInput[key];',
      "final c = entry.rawInput!['questions'];",
    ].join('\n');
    expect(accessesIn('web/src/a.ts', source, vocabulary).map((hit) => hit.line)).toEqual([
      1, 2, 2, 3,
    ]);
  });

  it('leaves out the value carried whole, and a line that is a comment', () => {
    const source = [
      'const shown = JSON.stringify(tool.rawInput);',
      'const { rawInput } = payload;',
      '// rawInput.todos is read by F3',
      ' * rawInput.plan, in a block comment',
      'const rawInputs = [];',
    ].join('\n');
    expect(accessesIn('web/src/a.ts', source, vocabulary)).toEqual([]);
  });

  it('is read in code only, beside the other terms', () => {
    const found = scanFile('web/src/features/a.ts', 'x = tool.rawInput.todos;', vocabulary);
    expect(found.map((hit) => hit.term)).toEqual(['rawInput']);
    expect(
      scanFile('web/src/shared/i18n/locales/en.json', '{"a":"rawInput.todos"}', vocabulary),
    ).toEqual([]);
  });

  it('does not match an access term as a token of any other mode', () => {
    expect(hitsIn({ kind: 'identifier', text: 'rawInput', line: 1 }, access)).toBe(0);
  });
});

describe('neutral:check — the baseline (plan 28, B-05)', () => {
  const phases = new Map([
    ['F1', '🔲'],
    ['F2', '✅'],
  ]);

  it('passes a violation the baseline holds, and fails the same violation in a new file — S-11', () => {
    const baseline = [{ file: 'a.ts', term: 'claude', count: 1, phase: 'F1' }];

    expect(checkBaseline([violation('a.ts', 'claude')], baseline, phases)).toEqual([]);
    expect(
      checkBaseline(
        [violation('a.ts', 'claude'), violation('b.ts', 'claude', 7)],
        baseline,
        phases,
      ),
    ).toEqual([
      {
        kind: 'new',
        file: 'b.ts',
        term: 'claude',
        detail: '1 found (lines 7), the baseline allows 0',
      },
    ]);
  });

  it('fails one occurrence more than the baseline holds', () => {
    const baseline = [{ file: 'a.ts', term: 'claude', count: 1, phase: 'F1' }];

    expect(
      checkBaseline(
        [violation('a.ts', 'claude'), violation('a.ts', 'claude', 2)],
        baseline,
        phases,
      )[0]?.kind,
    ).toBe('new');
  });

  it('fails an entry that no longer occurs, or occurs less, until the baseline follows — S-12', () => {
    const baseline = [
      { file: 'a.ts', term: 'claude', count: 2, phase: 'F1' },
      { file: 'b.ts', term: 'Edit', count: 1, phase: 'F1' },
    ];

    expect(checkBaseline([violation('a.ts', 'claude')], baseline, phases)).toEqual([
      { kind: 'stale', file: 'a.ts', term: 'claude', detail: '1 found, the baseline still says 2' },
      { kind: 'stale', file: 'b.ts', term: 'Edit', detail: 'no longer occurs' },
    ]);
  });

  it('fails an entry whose phase is ✅, or is not a phase of the plan — S-13', () => {
    const baseline = [
      { file: 'a.ts', term: 'claude', count: 1, phase: 'F2' },
      { file: 'b.ts', term: 'claude', count: 1, phase: '?' },
    ];

    expect(
      checkBaseline([violation('a.ts', 'claude'), violation('b.ts', 'claude')], baseline, phases),
    ).toEqual([
      {
        kind: 'phase-closed',
        file: 'a.ts',
        term: 'claude',
        detail: 'F2 is ✅, and it still occurs',
      },
      { kind: 'bad-entry', file: 'b.ts', term: 'claude', detail: 'phase ? is not F1…F7' },
    ]);
  });

  it('fails the same file and term twice', () => {
    const entry = { file: 'a.ts', term: 'claude', count: 1, phase: 'F1' };

    expect(checkBaseline([violation('a.ts', 'claude')], [entry, entry], phases)[0]?.kind).toBe(
      'bad-entry',
    );
  });

  it('passes an empty baseline over a clean core, and a baseline of one entry — S-14', () => {
    expect(checkBaseline([], [], phases)).toEqual([]);
    expect(
      checkBaseline(
        [violation('a.ts', 'claude')],
        [{ file: 'a.ts', term: 'claude', count: 1, phase: 'F1' }],
        phases,
      ),
    ).toEqual([]);
  });

  it('writes the same baseline twice from the same tree, keeping each phase — S-15', () => {
    const found = [
      violation('b.ts', 'claude'),
      violation('a.ts', 'Edit'),
      violation('a.ts', 'claude'),
    ];
    const once = writtenBaseline(found, [{ file: 'a.ts', term: 'claude', count: 5, phase: 'F3' }]);

    expect(once).toEqual([
      { file: 'a.ts', term: 'claude', count: 1, phase: 'F3' },
      { file: 'a.ts', term: 'Edit', count: 1, phase: '?' },
      { file: 'b.ts', term: 'claude', count: 1, phase: '?' },
    ]);
    expect(writtenBaseline(found, once)).toEqual(once);
  });

  it('sums what each phase still removes, in the order of the phases', () => {
    expect(
      remainingByPhase([
        { file: 'a', term: 'x', count: 2, phase: 'F10' },
        { file: 'b', term: 'x', count: 1, phase: 'F2' },
        { file: 'c', term: 'y', count: 3, phase: 'F2' },
      ]),
    ).toEqual([
      ['F2', { entries: 2, occurrences: 4 }],
      ['F10', { entries: 1, occurrences: 2 }],
    ]);
  });
});

describe('neutral:check — where a violation is reported', () => {
  it('reports a term inside a comment of many lines on its own line', () => {
    expect(
      scanFile('backend/src/a.ts', '/**\n * one\n * two claude\n */\nconst x = 1;\n', VOCABULARY),
    ).toMatchObject([{ term: 'claude', line: 3 }]);
  });

  it('reads a literal once, on the line its string opens', () => {
    expect(
      scanFile('backend/src/a.ts', "const a = `Edit`;\nconst b = 'Edit';\n", VOCABULARY),
    ).toMatchObject([
      { term: 'Edit', line: 1 },
      { term: 'Edit', line: 2 },
    ]);
  });
});
