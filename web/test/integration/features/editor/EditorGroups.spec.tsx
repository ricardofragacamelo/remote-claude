import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import {
  FOLDER,
  editorOf,
  editorState,
  press,
  pressSave,
  renderEditor,
  stripOf,
  typeInto,
} from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function group(place: number): HTMLElement {
  return screen.getByRole('region', { name: t('editor.group.label', { place }) });
}

function editorsOf(name: string): HTMLTextAreaElement[] {
  return screen.getAllByRole('textbox', {
    name: t('editor.view.label', { name }),
  }) as HTMLTextAreaElement[];
}

describe('groups side by side — plan 07, B-33', () => {
  it('opens to the side in a second group, and a tab dragged across moves there (S-221)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts');
    });
    await editorOf('b.ts');

    await user.click(within(group(1)).getByRole('button', { name: t('editor.strip.openToSide') }));
    await waitFor(() => {
      expect(editorState().groups).toHaveLength(2);
    });
    expect(
      within(group(2)).getByRole('textbox', { name: t('editor.view.label', { name: 'b.ts' }) }),
    ).toBeVisible();

    // Dragged from the second group onto the first: the second, left with nothing, closes.
    const data = new Map<string, string>();
    const transfer = {
      effectAllowed: 'all',
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
    };
    act(() => {
      const start = new Event('dragstart', { bubbles: true });
      Object.assign(start, { dataTransfer: transfer });
      within(stripOf(2)).getByRole('button', { name: 'b.ts' }).dispatchEvent(start);
      const dropped = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(dropped, { dataTransfer: transfer });
      within(stripOf(1)).getByRole('list').dispatchEvent(dropped);
    });
    expect(editorState().groups).toHaveLength(1);
  });

  it('shares one buffer between two groups: an edit in one is dirty in both, a save cleans both (S-222)', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'a.ts', { toSide: true });
    });
    await waitFor(() => {
      expect(editorsOf('a.ts')).toHaveLength(2);
    });
    const [left, right] = editorsOf('a.ts');

    typeInto(left as HTMLTextAreaElement, 'two');
    expect(right?.value).toBe('two');
    for (const place of [1, 2]) {
      expect(
        within(stripOf(place)).getByRole('button', {
          name: t('editor.tab.closeDirty', { name: 'a.ts' }),
        }),
      ).toBeVisible();
    }

    pressSave(right as HTMLTextAreaElement);
    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('two');
    });
    for (const place of [1, 2]) {
      expect(
        within(stripOf(place)).getByRole('button', {
          name: t('editor.tab.close', { name: 'a.ts' }),
        }),
      ).toBeVisible();
    }
  });

  it('closes a group with its last tab (S-223)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    await editorOf('b.ts');

    await user.click(
      within(stripOf(2)).getByRole('button', { name: t('editor.tab.close', { name: 'b.ts' }) }),
    );
    expect(
      screen.queryByRole('region', { name: t('editor.group.label', { place: 2 }) }),
    ).toBeNull();
    expect(await editorOf('a.ts')).toBeVisible();
  });

  it('shows one group at a time below md, with a selector (S-224)', async () => {
    const user = userEvent.setup();
    aViewport('phone');
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    await editorOf('b.ts');
    const selector = screen.getByRole('group', { name: t('editor.group.selector') });

    expect(
      screen.queryByRole('region', { name: t('editor.group.label', { place: 1 }) }),
    ).toBeNull();
    expect(
      within(selector).getByRole('button', { name: t('editor.group.label', { place: 2 }) }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      within(selector).getByRole('button', { name: t('editor.group.label', { place: 1 }) }),
    );
    expect(await editorOf('a.ts')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: t('editor.view.label', { name: 'b.ts' }) }),
    ).toBeNull();
  });

  it('moves the focus between groups from the keyboard (S-268)', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    const b = await editorOf('b.ts');
    const a = await editorOf('a.ts');

    press(b, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(b, { key: 'ArrowRight', code: 'ArrowRight', ctrlKey: true });
    await waitFor(() => {
      expect(a).toHaveFocus();
    });
    expect(editorState().activeGroup).toBe(editorState().groups[0]?.id);

    press(a, { key: 'k', code: 'KeyK', ctrlKey: true });
    press(a, { key: 'ArrowLeft', code: 'ArrowLeft', ctrlKey: true });
    await waitFor(() => {
      expect(b).toHaveFocus();
    });
  });
});
