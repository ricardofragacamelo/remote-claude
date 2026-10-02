import { afterEach, describe, expect, it } from 'vitest';

import {
  claudePanelStore,
  DEFAULT_CHOICES,
  forgetClaudePanel,
  MAX_REVIEWED_SESSIONS,
  tabKeyOf,
} from '@/features/session/store/claude-panel.store';
import {
  CLAUDE_PANEL_RESTORER,
  keptClaudePanelFrom,
} from '@/features/session/store/claude-panel-restorer';

afterEach(() => {
  forgetClaudePanel(null);
});

describe('the panel of Claude of one folder tab — plan 08, B-28', () => {
  it('is the tab’s own: two folders, two panels', () => {
    claudePanelStore('/a').getState().showPane('changes');

    expect(claudePanelStore('/a').getState().pane).toBe('changes');
    expect(claudePanelStore('/b').getState().pane).toBe('chat');
  });

  it('marks files reviewed by the version looked at, and unmarks them — S-125', () => {
    const panel = claudePanelStore('/a').getState();
    panel.review('s1', [
      { path: '/x', revision: 'r1' },
      { path: '/y', revision: 'r2' },
    ]);
    claudePanelStore('/a').getState().unreview('s1', '/y');
    claudePanelStore('/a').getState().unreview('s9', '/y');

    expect(claudePanelStore('/a').getState().reviewed).toEqual({ s1: { '/x': 'r1' }, s9: {} });
  });

  it(`keeps the marks of the ${String(MAX_REVIEWED_SESSIONS)} sessions marked last — fron`, () => {
    for (let index = 0; index <= MAX_REVIEWED_SESSIONS; index += 1) {
      claudePanelStore('/a')
        .getState()
        .review(`s${String(index)}`, [{ path: '/x', revision: 'r' }]);
    }
    claudePanelStore('/a')
      .getState()
      .review('s1', [{ path: '/z', revision: 'r' }]);

    const sessions = Object.keys(claudePanelStore('/a').getState().reviewed);
    expect(sessions).toHaveLength(MAX_REVIEWED_SESSIONS);
    expect(sessions).not.toContain('s0');
    expect(sessions.at(-1)).toBe('s1');
  });

  it('forgets one folder, or every one', () => {
    claudePanelStore('/a').getState().showPane('changes');
    forgetClaudePanel('/a');
    expect(claudePanelStore('/a').getState().pane).toBe('chat');
  });
});

describe('what a reload gives the panel back — S-125', () => {
  it('keeps the filter and the marks, never the pane', () => {
    const panel = claudePanelStore('/a').getState();
    panel.setChangesFilter('all');
    panel.review('s1', [{ path: '/x', revision: 'r1' }]);
    panel.showPane('changes');

    const kept = CLAUDE_PANEL_RESTORER.capture('/a');
    expect(kept).toEqual({
      changesFilter: 'all',
      reviewed: { s1: { '/x': 'r1' } },
      tabs: [],
      active: null,
      contexts: {},
    });

    forgetClaudePanel(null);
    CLAUDE_PANEL_RESTORER.apply('/a', kept);
    expect(claudePanelStore('/a').getState()).toMatchObject({ changesFilter: 'all', pane: 'chat' });

    let told = 0;
    const stop = CLAUDE_PANEL_RESTORER.subscribe('/a', () => {
      told += 1;
    });
    claudePanelStore('/a').getState().setChangesFilter('pending');
    stop();
    expect(told).toBe(1);
  });

  it('trusts only what reads as a panel', () => {
    expect(keptClaudePanelFrom('nonsense')).toBeUndefined();
    expect(
      keptClaudePanelFrom({
        changesFilter: 'weird',
        reviewed: { s1: { '/x': 'r', '/y': 3 }, s2: 'x' },
      }),
    ).toEqual({
      changesFilter: 'pending',
      reviewed: { s1: { '/x': 'r' }, s2: {} },
      tabs: [],
      active: null,
      contexts: {},
    });
    expect(keptClaudePanelFrom({})).toEqual({
      changesFilter: 'pending',
      reviewed: {},
      tabs: [],
      active: null,
      contexts: {},
    });
  });

  it('gives the tabs back, each as far as it reads as one, and the one on screen — S-147', () => {
    const kept = keptClaudePanelFrom({
      tabs: [
        { key: 'draft:1', kind: 'draft', choices: { model: 'opus', mode: 'plan', effort: 'high' } },
        {
          key: 'draft:2',
          kind: 'draft',
          choices: { model: 3, mode: 'bypassPermissions', effort: 'x' },
        },
        { key: 'draft:3', kind: 'draft', choices: 'none' },
        { key: 'session:s1', kind: 'session', sessionId: 's1' },
        { key: 'session:s2', kind: 'session' },
        { key: 'conversation:c1', kind: 'conversation', conversationId: 'c1' },
        { key: 'conversation:c2', kind: 'conversation', conversationId: 7 },
        { key: 'other', kind: 'spreadsheet' },
        { kind: 'draft' },
        'tab',
      ],
      active: 'session:s1',
    });

    expect(kept?.tabs).toEqual([
      { key: 'draft:1', kind: 'draft', choices: { model: 'opus', mode: 'plan', effort: 'high' } },
      { key: 'draft:2', kind: 'draft', choices: DEFAULT_CHOICES },
      { key: 'draft:3', kind: 'draft', choices: DEFAULT_CHOICES },
      { key: 'session:s1', kind: 'session', sessionId: 's1' },
      { key: 'conversation:c1', kind: 'conversation', conversationId: 'c1' },
    ]);
    expect(kept?.active).toBe('session:s1');
    expect(keptClaudePanelFrom({ tabs: 'x', active: 'gone' })).toMatchObject({
      tabs: [],
      active: null,
    });
  });
});

describe('the conversations of the panel, in tabs — S-150', () => {
  const panel = (): ReturnType<ReturnType<typeof claudePanelStore>['getState']> =>
    claudePanelStore('/a').getState();

  it('opens drafts under keys of their own, each on screen as it opens', () => {
    const first = panel().openDraft();
    const second = panel().openDraft();

    expect(first).not.toBe(second);
    expect(panel().active).toBe(second);
    expect(panel().tabs.map((tab) => tab.kind)).toEqual(['draft', 'draft']);
  });

  it('never gives a draft the key of one a reload gave back', () => {
    claudePanelStore('/a').setState({
      tabs: [{ key: 'draft:1', kind: 'draft', choices: DEFAULT_CHOICES }],
    });

    expect(panel().openDraft()).toBe('draft:2');
  });

  it('shows a session in the tab it has, or a new one', () => {
    panel().show('session', 's1');
    panel().show('conversation', 'c1');
    panel().show('session', 's1');

    expect(panel().tabs.map((tab) => tab.key)).toEqual([
      tabKeyOf('session', 's1'),
      tabKeyOf('conversation', 'c1'),
    ]);
    expect(panel().active).toBe('session:s1');
  });

  it('activates only a tab it has', () => {
    panel().show('session', 's1');
    panel().activate('session:none');
    expect(panel().active).toBe('session:s1');
  });

  it('closes a tab — the neighbour comes on screen, and what was written in it goes', () => {
    const draft = panel().openDraft();
    panel().setDraft(draft, 'half');
    panel().show('session', 's1');
    panel().show('session', 's2');
    panel().activate(draft);

    panel().close(draft);
    expect(panel().active).toBe('session:s1');
    expect(panel().drafts).toEqual({});

    panel().close('session:s2');
    expect(panel().active).toBe('session:s1');
    panel().close('session:s1');
    expect(panel().active).toBeNull();
  });

  it('moves a tab a place, and leaves one at the end where it is', () => {
    panel().show('session', 's1');
    panel().show('session', 's2');

    panel().move('session:s2', -1);
    expect(panel().tabs.map((tab) => tab.key)).toEqual(['session:s2', 'session:s1']);
    panel().move('session:s2', -1);
    panel().move('missing', 1);
    expect(panel().tabs.map((tab) => tab.key)).toEqual(['session:s2', 'session:s1']);
  });

  it('changes the choices of a draft only', () => {
    const draft = panel().openDraft();
    panel().show('session', 's1');
    const plan = { model: 'opus', mode: 'plan', effort: 'low' } as const;

    panel().setChoices(draft, plan);
    panel().setChoices('session:s1', plan);

    expect(panel().tabs).toEqual([
      { key: draft, kind: 'draft', choices: plan },
      { key: 'session:s1', kind: 'session', sessionId: 's1' },
    ]);
  });

  it('turns a draft into its session in the same place — once, even when the session had a tab', () => {
    const draft = panel().openDraft();
    panel().setDraft(draft, 'hi');
    panel().show('session', 's1');
    panel().activate(draft);

    panel().promote(draft, 's1');

    expect(panel().tabs).toEqual([{ key: 'session:s1', kind: 'session', sessionId: 's1' }]);
    expect(panel().active).toBe('session:s1');
    expect(panel().drafts).toEqual({});
  });

  it('keeps the tab on screen when a draft behind it becomes a session', () => {
    const draft = panel().openDraft();
    panel().show('session', 's9');
    panel().promote(draft, 's1');

    expect(panel().active).toBe('session:s9');
  });
});

describe('the context of each conversation — plan 08, B-47', () => {
  const file = {
    id: 'f',
    kind: 'file',
    path: 'a.ts',
    size: 3,
    binary: false,
    missing: false,
  } as const;
  const upload = {
    id: 'u',
    kind: 'upload',
    name: 'shot.png',
    mediaType: 'image/png',
    size: 9,
    uploadKind: 'image',
    attachmentId: 'att_1',
    error: null,
  } as const;
  const panel = () => claudePanelStore('/c').getState();

  it('keeps a set per tab, and a notice per tab — two conversations, two sets (S-225)', () => {
    const one = panel().openDraft();
    const two = panel().openDraft();
    panel().setContext(one, [file]);
    panel().setNotice(two, { key: 'composer.set.overflow', params: { count: 1 } });

    expect(panel().contexts).toEqual({ [one]: [file] });
    expect(panel().notices[two]).toMatchObject({ key: 'composer.set.overflow' });

    panel().setContext(one, []);
    panel().setNotice(two, null);
    expect(panel().contexts).toEqual({});
    expect(panel().notices).toEqual({});
  });

  it('lets the set of a tab go with it, and moves the set of a draft to its session', () => {
    const one = panel().openDraft();
    const two = panel().openDraft();
    panel().setContext(one, [file]);
    panel().setContext(two, [file]);

    panel().close(one);
    panel().promote(two, 's1');

    expect(panel().contexts).toEqual({ [tabKeyOf('session', 's1')]: [file] });
    panel().promote(panel().openDraft(), 's2');
    expect(Object.keys(panel().contexts)).toEqual([tabKeyOf('session', 's1')]);
  });

  it('keeps the set across a reload — paths, lines and held uploads, never a text — S-221', () => {
    const key = panel().openDraft();
    const range = {
      id: 'r',
      kind: 'range',
      path: 'b.ts',
      startLine: 2,
      endLine: 4,
      size: 9,
      binary: false,
      missing: false,
    } as const;
    panel().setContext(key, [
      file,
      { id: 'd', kind: 'folder', path: 'src' },
      range,
      upload,
      { ...upload, id: 'u2', attachmentId: null },
      { id: 't', kind: 'text', source: 'terminal', label: 'b', content: 'out' },
    ]);

    const kept = CLAUDE_PANEL_RESTORER.capture('/c');
    const parsed = keptClaudePanelFrom(JSON.parse(JSON.stringify(kept)));

    expect(parsed?.contexts[key]).toEqual([
      { ...file, size: null },
      { id: 'd', kind: 'folder', path: 'src' },
      { ...range, size: null },
      upload,
    ]);
  });

  it('trusts only what reads as an item of the context', () => {
    const parsed = keptClaudePanelFrom({
      contexts: {
        a: [
          { id: 'f', kind: 'file' },
          { id: 'r', kind: 'range', path: 'x', startLine: 0, endLine: 2 },
          { kind: 'folder', path: 'y' },
          {
            id: 'u',
            kind: 'upload',
            name: 'n',
            mediaType: 'm',
            size: 'big',
            uploadKind: 'image',
            attachmentId: 'a',
          },
          {
            id: 'u',
            kind: 'upload',
            name: 'n',
            mediaType: 'm',
            size: 1,
            uploadKind: 'video',
            attachmentId: 'a',
          },
          { id: 'd', kind: 'folder', path: 'ok' },
        ],
        b: 'nonsense',
        c: [],
      },
    });

    expect(parsed?.contexts).toEqual({ a: [{ id: 'd', kind: 'folder', path: 'ok' }] });
    expect(keptClaudePanelFrom({ contexts: 'x' })?.contexts).toEqual({});
  });
});
