import { afterEach, describe, expect, it } from 'vitest';

import { registerClaudeContext } from '@/features/session';
import { addToPanelContext } from '@/features/session/register-context';
import { mentionProviders } from '@/features/session/lib/mention-providers';
import { MAX_CONTEXT_ITEMS } from '@/features/session/lib/context-set';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { addToClaudeContext, claudeContextTargets } from '@/shared/lib/files-drag';
import { showView } from '@/features/editor/hooks/views';
import { editorStoreOf, forgetEditor } from '@/features/editor/store/editor.store';
import type { CodeView } from '@/features/editor/types/code-editor';

const FOLDER = '/srv/projects/app';
const panel = () => claudePanelStore(FOLDER).getState();

afterEach(() => {
  forgetClaudePanel(null);
});

describe("Claude's context from the tree, the tabs and the editor — plan 08, B-49, B-51", () => {
  it('takes what is handed in the conversation on screen of the same folder tab — S-240, S-249', () => {
    const draft = panel().openDraft();

    addToPanelContext({ folder: FOLDER, entries: [{ path: 'src/a.ts', kind: 'file' }] });

    expect(panel().contexts[draft]?.map((item) => item.kind)).toEqual(['file']);
  });

  it('opens a draft when what is on screen is a conversation that only reads', () => {
    panel().show('conversation', 'c1');

    addToPanelContext({ folder: FOLDER, entries: [{ path: 'docs', kind: 'directory' }] });

    const key = panel().active ?? '';
    expect(key).toMatch(/^draft:/);
    expect(panel().contexts[key]?.map((item) => item.kind)).toEqual(['folder']);
  });

  it('opens a draft when the panel has no conversation yet', () => {
    addToPanelContext({ folder: FOLDER, entries: [{ path: 'a.ts', kind: 'file' }] });

    expect(panel().tabs.map((tab) => tab.kind)).toEqual(['draft']);
  });

  it('offers what is selected in the active editor as @selection, one range per cursor — S-226', () => {
    const undo = registerClaudeContext();
    const store = editorStoreOf(FOLDER);
    const group = store.getState().activeGroup;
    store.setState({
      groups: [
        {
          id: group,
          tabs: [{ id: 't', kind: 'file', path: 'a.ts', preview: false, pinned: false }],
          active: 't',
        },
      ],
    });
    const release = showView(FOLDER, group, {
      selections: () => [
        { startLine: 1, startColumn: 1, endLine: 2, endColumn: 1 },
        { startLine: 7, startColumn: 1, endLine: 7, endColumn: 4 },
      ],
    } as unknown as CodeView);

    expect(
      mentionProviders
        .entries()[0]
        ?.items(FOLDER)
        ?.map((item) => item.kind === 'range' && [item.startLine, item.endLine]),
    ).toEqual([
      [1, 2],
      [7, 7],
    ]);

    release();
    forgetEditor(FOLDER);
    undo();
  });

  it('says what it left out past the ceiling — S-235, S-251', () => {
    const draft = panel().openDraft();

    addToPanelContext({
      folder: FOLDER,
      entries: Array.from({ length: MAX_CONTEXT_ITEMS + 2 }, (_, index) => ({
        path: `f${String(index)}.ts`,
        kind: 'file' as const,
      })),
    });

    expect(panel().contexts[draft]).toHaveLength(MAX_CONTEXT_ITEMS);
    expect(panel().notices[draft]).toEqual({ key: 'composer.set.overflow', params: { count: 2 } });
  });

  it('registers the panel as the target, and @selection as a provider, until taken back', () => {
    const undo = registerClaudeContext();
    panel().openDraft();

    expect(addToClaudeContext({ folder: FOLDER, entries: [{ path: 'a.ts', kind: 'file' }] })).toBe(
      true,
    );
    expect(mentionProviders.entries().map((provider) => provider.keyword)).toEqual(['selection']);
    // Without an editor of the folder, the selection has nothing to give.
    expect(mentionProviders.entries()[0]?.items(FOLDER)).toBeNull();

    undo();
    expect(claudeContextTargets.entries()).toEqual([]);
    expect(mentionProviders.entries()).toEqual([]);
  });
});
