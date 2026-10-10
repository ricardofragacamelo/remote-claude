import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { filesUnder } from '../../../scripts/lib/files.mjs';
import { repoRoot } from '../../../scripts/lib/paths.mjs';
import {
  checkParity,
  declares,
  decisionStates,
  fileOf,
  labelKeysIn,
  pendingByPhase,
  phaseStates,
  symbolOf,
} from '../../../scripts/lib/render-parity.mjs';

/** A tree of files, by path, and the state of the plan beside it. */
function treeOf(
  /** @type {Record<string, string>} */ files,
  /** @type {{ decisions?: [string, string][], phases?: [string, string][], webFiles?: string[], labelKeys?: string[] }} */ plan = {},
) {
  return {
    webFiles: plan.webFiles ?? ['web/conv/Item.tsx'],
    labelKeys: plan.labelKeys ?? [],
    exists: (/** @type {string} */ file) => Object.hasOwn(files, file),
    contentOf: (/** @type {string} */ file) => files[file] ?? '',
    decisions: new Map(plan.decisions ?? [['D-11', '✅']]),
    phases: new Map(plan.phases ?? [['F2', '🔲']]),
  };
}

const FILES = {
  'web/conv/Item.tsx': 'export function Item() {}',
  'mobile/lib/item.dart': 'class ItemView extends StatelessWidget {}',
  'mobile/test/item_test.dart': "testWidgets('draws markdown-rich-turn', …)",
};

/** A map of these entries. */
function mapOf(/** @type {any[]} */ entries, pendingAllowed = true) {
  return { webRoots: ['web/conv'], labelSources: [], labelPattern: '', pendingAllowed, entries };
}

/** @type {import('../../../scripts/lib/render-parity.mjs').ParityEntry} */
const OK = {
  element: 'item',
  web: 'web/conv/Item.tsx',
  app: 'mobile/lib/item.dart#ItemView',
  appTest: 'mobile/test/item_test.dart',
  state: 'ok',
};

/** The kinds of the problems a map has against a tree. */
const kinds = (/** @type {any} */ map, /** @type {any} */ tree) =>
  checkParity(map, tree).problems.map((each) => each.kind);

describe('render:check — plan 26, B-05', () => {
  it('passes a map whose every component has its pair, its widget and its test', () => {
    expect(checkParity(mapOf([OK]), treeOf(FILES))).toEqual({
      problems: [],
      pending: [],
      entries: 1,
    });
  });

  it('fails a component of the web with no entry, and names it — S-11', () => {
    const { problems } = checkParity(
      mapOf([OK]),
      treeOf(
        { ...FILES, 'web/conv/New.tsx': '' },
        { webFiles: ['web/conv/Item.tsx', 'web/conv/New.tsx'] },
      ),
    );

    expect(problems).toEqual([
      {
        kind: 'unmapped',
        subject: 'web/conv/New.tsx',
        detail: 'a component of the conversation with no entry',
      },
    ]);
  });

  it('fails a label of a tool with no entry, once however often it is written', () => {
    expect(
      kinds(
        mapOf([OK]),
        treeOf(FILES, { labelKeys: ['sessions.tool.read', 'sessions.tool.read'] }),
      ),
    ).toEqual(['unmapped-label']);
    expect(
      kinds(
        mapOf([OK, { ...OK, element: 'label.read', label: 'sessions.tool.read' }]),
        treeOf(FILES, { labelKeys: ['sessions.tool.read'] }),
      ),
    ).toEqual([]);
  });

  it('fails an entry whose widget or test the app does not have — S-12', () => {
    expect(kinds(mapOf([{ ...OK, app: 'mobile/lib/gone.dart#ItemView' }]), treeOf(FILES))).toEqual([
      'missing-app',
    ]);
    expect(kinds(mapOf([{ ...OK, app: 'mobile/lib/item.dart#Other' }]), treeOf(FILES))).toEqual([
      'missing-symbol',
    ]);
    expect(kinds(mapOf([{ ...OK, appTest: 'mobile/test/gone_test.dart' }]), treeOf(FILES))).toEqual(
      ['missing-test'],
    );
    expect(kinds(mapOf([{ ...OK, web: 'web/conv/Gone.tsx' }]), treeOf(FILES))).toEqual([
      'unmapped',
      'missing-web',
    ]);
  });

  it('wants an ok entry to name both, and its test to draw the recording it names', () => {
    expect(kinds(mapOf([{ ...OK, appTest: undefined }]), treeOf(FILES))).toEqual(['bad-entry']);
    expect(kinds(mapOf([{ ...OK, fixture: 'markdown-rich-turn' }]), treeOf(FILES))).toEqual([]);
    expect(kinds(mapOf([{ ...OK, fixture: 'subagent-permission-turn' }]), treeOf(FILES))).toEqual([
      'missing-fixture',
    ]);
    expect(kinds(mapOf([{ ...OK, app: 'mobile/lib/item.dart' }]), treeOf(FILES))).toEqual([]);
  });

  it('fails an exclusion whose decision does not exist or is not ✅, and passes one that is — S-13, S-79', () => {
    const excluded = { element: 'item', web: 'web/conv/Item.tsx', state: 'excluded' };

    expect(kinds(mapOf([{ ...excluded, decision: 'D-11' }]), treeOf(FILES))).toEqual([]);
    expect(kinds(mapOf([{ ...excluded, decision: 'D-99' }]), treeOf(FILES))).toEqual([
      'bad-exclusion',
    ]);
    expect(
      kinds(
        mapOf([{ ...excluded, decision: 'D-11' }]),
        treeOf(FILES, { decisions: [['D-11', '🔲']] }),
      ),
    ).toEqual(['bad-exclusion']);
    expect(kinds(mapOf([excluded]), treeOf(FILES))).toEqual(['bad-entry']);
  });

  it('fails a pending entry whose phase is already ✅, and one with no phase — S-14', () => {
    const pending = { element: 'item', web: 'web/conv/Item.tsx', state: 'pending' };

    expect(kinds(mapOf([{ ...pending, phase: 'F2' }]), treeOf(FILES))).toEqual([]);
    expect(
      kinds(mapOf([{ ...pending, phase: 'F2' }]), treeOf(FILES, { phases: [['F2', '✅']] })),
    ).toEqual(['stale-pending']);
    expect(kinds(mapOf([{ ...pending, phase: 'later' }]), treeOf(FILES))).toEqual(['bad-entry']);
  });

  it('fails any pending entry once the map allows none — S-77', () => {
    expect(
      kinds(
        mapOf(
          [{ element: 'item', web: 'web/conv/Item.tsx', state: 'pending', phase: 'F5' }],
          false,
        ),
        treeOf(FILES),
      ),
    ).toEqual(['pending']);
  });

  it('fails an unknown state and an element written twice', () => {
    expect(kinds(mapOf([{ ...OK, state: 'maybe' }]), treeOf(FILES))).toEqual(['bad-entry']);
    expect(kinds(mapOf([OK, OK]), treeOf(FILES))).toEqual(['duplicate']);
  });

  it('lists what is pending by phase, in the order of the phases', () => {
    expect(
      pendingByPhase([
        { element: 'b', web: '', state: 'pending', phase: 'F10' },
        { element: 'a', web: '', state: 'pending', phase: 'F3' },
        { element: 'c', web: '', state: 'pending', phase: 'F3' },
        { element: 'd', web: '', state: 'pending' },
        { ...OK },
      ]),
    ).toEqual([
      ['?', ['d']],
      ['F3', ['a', 'c']],
      ['F10', ['b']],
    ]);
  });

  it('reads the references, the declarations, the keys and the state of the plan', () => {
    expect(fileOf('a/b.dart#Name')).toBe('a/b.dart');
    expect(fileOf('a/b.dart')).toBe('a/b.dart');
    expect(symbolOf('a/b.dart#Name')).toBe('Name');
    expect(symbolOf('a/b.dart')).toBeNull();

    expect(declares('class MessageBubble extends X {}', 'MessageBubble')).toBe(true);
    expect(declares('String toolLabel(AppLocalizations l10n) {}', 'toolLabel')).toBe(true);
    expect(declares('const String mermaidTag = "m";', 'mermaidTag')).toBe(true);
    expect(declares('// MessageBubble is drawn here', 'MessageBubble')).toBe(false);

    expect(
      labelKeysIn("key: 'sessions.tool.read', 'other'", "'(sessions\\.tool\\.[A-Za-z]+)'"),
    ).toEqual(['sessions.tool.read']);
    expect(
      decisionStates(
        '| ID | Decisão | Estado |\n|---|---|---|\n| D-01 | x | ✅ |\n| D-02 | y | 🔲 |\n',
      ),
    ).toEqual(
      new Map([
        ['D-01', '✅'],
        ['D-02', '🔲'],
      ]),
    );
    expect(
      phaseStates(
        '| [F0](F0-spike.md) | B-01…B-03 | 3/3 | ✅ |\n| [F1](F1.md) | B-04 | 0/3 | 🔲 |\n| **Total** | x | y | z |',
      ),
    ).toEqual(
      new Map([
        ['F0', '✅'],
        ['F1', '🔲'],
      ]),
    );
  });

  it('gives the same answer twice over the same tree — S-15', () => {
    const map = mapOf([
      OK,
      { element: 'p', web: 'web/conv/Item.tsx', state: 'pending', phase: 'F2' },
    ]);

    expect(checkParity(map, treeOf(FILES))).toEqual(checkParity(map, treeOf(FILES)));
  });
});

describe('the map of the repository — S-09, S-10', () => {
  const map = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts', 'render-parity.json'), 'utf8'),
  );
  const plan = path.join(repoRoot, 'docs', 'plans', '26-mobile-conversation-parity');
  const read = (/** @type {string} */ file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const tree = {
    webFiles: map.webRoots.flatMap((/** @type {string} */ root) =>
      filesUnder(path.join(repoRoot, root), ['.tsx']).map((file) => path.relative(repoRoot, file)),
    ),
    labelKeys: map.labelSources.flatMap((/** @type {string} */ source) =>
      labelKeysIn(read(source), map.labelPattern),
    ),
    exists: (/** @type {string} */ file) => fs.existsSync(path.join(repoRoot, file)),
    contentOf: read,
    decisions: decisionStates(fs.readFileSync(path.join(plan, 'decisions.md'), 'utf8')),
    phases: phaseStates(fs.readFileSync(path.join(plan, 'progress.md'), 'utf8')),
  };

  it('has an entry for every component of the conversation and every label of a tool', () => {
    expect(tree.webFiles.length).toBeGreaterThan(10);
    expect(tree.labelKeys.length).toBeGreaterThan(20);
    expect(checkParity(map, tree).problems).toEqual([]);
  });

  it('starts as the discovery measured it: the inserting of code excluded, the rest ok or waiting for F2…F5', () => {
    const excluded = map.entries.filter((/** @type {any} */ entry) => entry.state === 'excluded');
    const phases = new Set(
      map.entries
        .filter((/** @type {any} */ entry) => entry.state === 'pending')
        .map((/** @type {any} */ entry) => entry.phase),
    );

    expect(excluded.map((/** @type {any} */ entry) => [entry.element, entry.decision])).toEqual([
      ['code.insertIntoEditor', 'D-11'],
    ]);
    for (const phase of phases) {
      expect(['F2', 'F3', 'F4', 'F5']).toContain(phase);
    }
  });
});
