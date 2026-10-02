import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { editorFake, resetEditorFake } from '../../../support/editor-fake';
import { APP, renderExplorer, row, theTree } from '../../../support/explorer';
import type { FakeEntry } from '../../../support/files-api';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

afterEach(() => {
  vi.restoreAllMocks();
  resetEditorFake();
});

/** The row that has the focus. */
function focusedRow(): string | null {
  return document.activeElement?.getAttribute('aria-label') ?? null;
}

async function focusFirst(name: string): Promise<void> {
  const first = await row(name);
  first.focus();
}

describe('ten thousand entries — S-161', () => {
  it('draws only the window, each row with its place among all of them', async () => {
    const tree: Record<string, FakeEntry | string> = {};
    for (let index = 0; index < 10_000; index += 1) {
      tree[`file-${String(index).padStart(5, '0')}.txt`] = '';
    }

    renderExplorer(tree);
    const first = await row('file-00000.txt');
    const drawn = within(await theTree()).getAllByRole('treeitem');

    expect(drawn.length).toBeGreaterThan(10);
    expect(drawn.length).toBeLessThan(100);
    expect(first).toHaveAttribute('aria-setsize', '10000');
    expect(first).toHaveAttribute('aria-posinset', '1');
    expect(first).toHaveAttribute('aria-level', '1');

    const scroller = (await theTree()).parentElement as HTMLElement;
    scroller.scrollTop = 22 * 5_000;
    scroller.dispatchEvent(new Event('scroll'));

    const middle = await row('file-05000.txt');
    expect(middle).toHaveAttribute('aria-posinset', '5001');
    expect(within(await theTree()).getAllByRole('treeitem').length).toBeLessThan(100);
  });
});

describe('the keyboard of the ARIA tree — S-162', () => {
  it('walks with the arrows, Home and End, and moves the tab stop with it', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    await focusFirst('a.ts');

    await user.keyboard('{ArrowDown}');
    expect(focusedRow()).toBe('b.ts');
    expect(await row('b.ts')).toHaveAttribute('tabindex', '0');
    expect(await row('a.ts')).toHaveAttribute('tabindex', '-1');
    expect(await row('b.ts')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    expect(focusedRow()).toBe('c.ts');
    await user.keyboard('{ArrowDown}');
    expect(focusedRow()).toBe('c.ts');
    await user.keyboard('{Home}');
    expect(focusedRow()).toBe('a.ts');
    await user.keyboard('{ArrowUp}');
    expect(focusedRow()).toBe('a.ts');
  });

  it('opens with →, goes in with → again, closes with ← and goes up with ←', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'src/inner.ts': 'i', 'zz.ts': 'z' });
    await focusFirst('src');

    await user.keyboard('{ArrowRight}');
    expect(await row('src')).toHaveAttribute('aria-expanded', 'true');
    await row('inner.ts');
    await user.keyboard('{ArrowRight}');
    expect(focusedRow()).toBe('inner.ts');

    await user.keyboard('{ArrowLeft}');
    expect(focusedRow()).toBe('src');
    await user.keyboard('{ArrowLeft}');
    expect(await row('src')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowLeft}');
    expect(focusedRow()).toBe('src');
  });

  it('finds a row by typing its name', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'alpha.ts': '', 'beta.ts': '', 'bravo.ts': '' });
    await focusFirst('alpha.ts');

    await user.keyboard('br');
    expect(focusedRow()).toBe('bravo.ts');
  });

  it('opens a file with Enter, through the command of the registry', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a', lib: { kind: 'directory' } });
    await focusFirst('a.ts');

    await user.keyboard('{Enter}');
    expect(editorFake.openFile).toHaveBeenCalledWith(APP, 'a.ts', {});

    await user.keyboard('{ArrowUp}{Enter}');
    expect(await row('lib')).toHaveAttribute('aria-expanded', 'true');
  });

  it('previews a file on a click, and keeps it open on a double click', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': 'a' });

    await user.click(await row('a.ts'));
    expect(editorFake.openFile).toHaveBeenLastCalledWith(APP, 'a.ts', { preview: true });
    await user.dblClick(await row('a.ts'));
    expect(editorFake.openFile).toHaveBeenLastCalledWith(APP, 'a.ts', {});
  });
});

describe('selecting many — S-181', () => {
  it('grows with Shift, adds with Ctrl, and Space and Ctrl+A from the keyboard', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': '', 'b.ts': '', 'c.ts': '', 'd.ts': '' });
    const selection = (): readonly string[] => explorerStore(APP).getState().selection;

    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts']);

    await user.keyboard('{Control>}{ArrowDown}{/Control}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(focusedRow()).toBe('d.ts');
    await user.keyboard('{Control>} {/Control}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    await user.keyboard('{Control>} {/Control}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts']);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(selection()).toEqual(['d.ts']);
    });

    await user.keyboard('{Control>}a{/Control}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    await user.keyboard(' ');
    expect(selection()).toEqual(['d.ts']);
  });

  it('grows a selection with a Shift click, and a Ctrl click adds one and takes it out', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a.ts': '', 'b.ts': '', 'c.ts': '' });
    const selection = (): readonly string[] => explorerStore(APP).getState().selection;

    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}');
    await user.click(await row('c.ts'));
    await user.keyboard('{/Shift}');
    expect(selection()).toEqual(['a.ts', 'b.ts', 'c.ts']);

    await user.keyboard('{Control>}');
    await user.click(await row('b.ts'));
    expect(selection()).toEqual(['a.ts', 'c.ts']);
    await user.click(await row('b.ts'));
    await user.keyboard('{/Control}');
    expect(selection()).toEqual(['a.ts', 'c.ts', 'b.ts']);
  });
});
