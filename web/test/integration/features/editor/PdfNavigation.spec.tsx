import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile } from '@/features/editor';
import { setPdfLoader } from '@/features/editor/lib/pdf-loader';
import { forgetEditor } from '@/features/editor/store/editor.store';
import { logger } from '@/shared/logging/logger';
import { FOLDER, renderEditor } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { fakeObservers } from '../../../support/observers';
import type { FakeObservers } from '../../../support/observers';
import { aFakePdf } from '../../../support/pdf-fake';
import type { FakePdf, FakePdfOptions } from '../../../support/pdf-fake';
import { fakeRaw } from '../../../support/raw-api';
import { translator } from '../../../support/render';

const t = translator('en');
let observers: FakeObservers;

const OUTLINE = [
  {
    title: 'Part one',
    dest: 'part1',
    items: [
      { title: 'Chapter one', dest: [2], items: [{ title: 'Section 1.1', dest: [3], items: [] }] },
      { title: 'Broken', dest: 'nowhere', items: [] },
    ],
  },
  { title: 'Part two', dest: [7], items: [] },
  { title: 'Heading only', dest: null, items: [] },
];

const TEXTS = [
  'Reader fixture',
  'The lighthouse keeper',
  'Section',
  'Plain',
  'A lighthouse stands',
  'Plain',
  'At dusk the light goes out',
  'Plain',
  'Lighthouse at night',
  'Explicit',
  'Appendix',
  '',
];

beforeEach(() => {
  observers = fakeObservers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setPdfLoader();
  forgetEditor(null);
});

function withPdf(options: Partial<FakePdfOptions> = {}): FakePdf {
  const pdf = aFakePdf({ pages: TEXTS, outline: OUTLINE, dests: { part1: 1 }, ...options });
  setPdfLoader(() => Promise.resolve(pdf.engine));
  fakeDisk(FOLDER, {});
  fakeRaw(FOLDER, { 'doc.pdf': '%PDF-1.7' });
  return pdf;
}

async function opened(): Promise<HTMLElement> {
  renderEditor(FOLDER, { strict: true });
  act(() => {
    openFile(FOLDER, 'doc.pdf');
  });
  const reader = await screen.findByRole('group', {
    name: t('editor.pdf.reader', { name: 'doc.pdf' }),
  });
  await waitFor(() => {
    expect(within(reader).getByRole('textbox', { name: t('editor.pdf.pageField') })).toBeEnabled();
  });
  return reader;
}

function panelButton(reader: HTMLElement): HTMLElement {
  return within(reader).getByRole('button', {
    name: new RegExp(`^(${t('editor.pdf.sidebarShow')}|${t('editor.pdf.sidebarHide')})$`),
  });
}

function sidebarOf(reader: HTMLElement): HTMLElement {
  return within(reader).getByRole('complementary', {
    name: t('editor.pdf.sidebar', { name: 'doc.pdf' }),
  });
}

function thumbnails(reader: HTMLElement): HTMLElement[] {
  return within(sidebarOf(reader)).getAllByRole('button', { name: /^Page \d+$/ });
}

describe('the side panel — plan 21, B-11', () => {
  it('opens and closes, on the outline when the PDF has one (S-31)', async () => {
    const user = userEvent.setup();
    withPdf();
    const reader = await opened();

    expect(within(reader).queryByRole('complementary')).toBeNull();
    await user.click(panelButton(reader));
    expect(panelButton(reader)).toHaveAttribute('aria-pressed', 'true');
    expect(
      await within(sidebarOf(reader)).findByRole('tree', {
        name: t('editor.pdf.outlineTree', { name: 'doc.pdf' }),
      }),
    ).toBeVisible();
    expect(
      within(sidebarOf(reader)).getByRole('tab', { name: t('editor.pdf.outline') }),
    ).toHaveAttribute('aria-selected', 'true');

    await user.click(panelButton(reader));
    expect(within(reader).queryByRole('complementary')).toBeNull();
  });

  it('opens on the thumbnails when the PDF has no outline, and says the outline is not there (S-31, S-36)', async () => {
    const user = userEvent.setup();
    withPdf({ outline: [] });
    const reader = await opened();

    await user.click(panelButton(reader));
    await waitFor(() => {
      expect(thumbnails(reader)).toHaveLength(12);
    });
    await user.click(within(sidebarOf(reader)).getByRole('tab', { name: t('editor.pdf.outline') }));
    expect(within(sidebarOf(reader)).getByText(t('editor.pdf.noOutline'))).toBeVisible();
    expect(within(sidebarOf(reader)).queryByRole('tree')).toBeNull();
  });

  it('lies over the pages in a narrow preview, and closes after taking you somewhere (S-32)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    observers.resize(reader, 400);

    await user.click(panelButton(reader));
    const sidebar = sidebarOf(reader);
    expect(sidebar.className).toContain('absolute');
    await user.click(await within(sidebar).findByRole('treeitem', { name: /Part two/ }));

    expect(pdf.views.at(-1)?.page).toBe(7);
    await waitFor(() => {
      expect(within(reader).queryByRole('complementary')).toBeNull();
    });

    // Wide again: beside the pages, and it stays open.
    observers.resize(reader, 900);
    await user.click(panelButton(reader));
    expect(sidebarOf(reader).className).not.toContain('absolute');
    await user.click(await within(sidebarOf(reader)).findByRole('treeitem', { name: /Part one/ }));
    expect(pdf.views.at(-1)?.page).toBe(1);
    expect(sidebarOf(reader)).toBeVisible();
  });
});

describe('the outline — plan 21, B-12', () => {
  it('is a tree walked with the keyboard of the pattern, Enter going where an entry leads (S-33)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    await user.click(panelButton(reader));
    const tree = await within(sidebarOf(reader)).findByRole('tree');

    const items = within(tree).getAllByRole('treeitem');
    expect(items.map((item) => item.textContent)).toEqual(['Part one', 'Part two', 'Heading only']);
    expect(items[0]).toHaveAttribute('aria-expanded', 'false');
    expect(items[0]).toHaveAttribute('aria-level', '1');
    expect(items[2]).not.toHaveAttribute('aria-expanded');

    act(() => {
      items[0]?.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    await user.keyboard('{ArrowRight}');
    expect(within(tree).getByRole('treeitem', { name: 'Chapter one' })).toHaveFocus();
    expect(within(tree).getByRole('treeitem', { name: 'Chapter one' })).toHaveAttribute(
      'aria-level',
      '2',
    );
    await user.keyboard('{Enter}');
    expect(pdf.views.at(-1)?.page).toBe(2);
    await user.keyboard('{ArrowLeft}');
    expect(within(tree).getByRole('treeitem', { name: 'Part one' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3);
    await user.keyboard('{End}');
    expect(within(tree).getByRole('treeitem', { name: 'Heading only' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(pdf.views.at(-1)?.page).toBe(2);
    await user.keyboard('{Home}');
    expect(within(tree).getByRole('treeitem', { name: 'Part one' })).toHaveFocus();

    // A key the tree does not take, and a click beside the entries, do nothing.
    await user.keyboard('a');
    expect(within(tree).getByRole('treeitem', { name: 'Part one' })).toHaveFocus();
    await user.click(tree);
    expect(pdf.views.at(-1)?.page).toBe(2);
    act(() => {
      within(tree).getByRole('treeitem', { name: 'Part one' }).focus();
    });

    // An entry closed with the focus inside it gives the stop back to the top.
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(within(tree).getByRole('treeitem', { name: 'Chapter one' })).toHaveFocus();
    await user.click(
      within(tree)
        .getByRole('treeitem', { name: 'Part one' })
        .querySelector('[data-chevron]') as HTMLElement,
    );
    expect(within(tree).getByRole('treeitem', { name: 'Part one' })).toHaveAttribute(
      'tabindex',
      '0',
    );

    // The chevron opens and closes; the title goes.
    const chevron = within(tree)
      .getByRole('treeitem', { name: 'Part one' })
      .querySelector('[data-chevron]') as HTMLElement;
    await user.click(chevron);
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    expect(pdf.views.at(-1)?.page).toBe(2);
  });

  it('goes nowhere for an entry whose destination the PDF lacks, says so at warn, and the reader stays (S-35)', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(logger, 'warn');
    const pdf = withPdf();
    const reader = await opened();
    await user.click(panelButton(reader));
    const tree = await within(sidebarOf(reader)).findByRole('tree');
    act(() => {
      within(tree).getByRole('treeitem', { name: 'Part one' }).focus();
    });
    await user.keyboard('{ArrowRight}');

    await user.click(within(tree).getByRole('treeitem', { name: 'Broken' }));
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'editor.pdf.destination' }),
        expect.any(String),
      );
    });
    expect(pdf.views.at(-1)?.page).toBe(1);
    expect(
      within(reader).getByRole('region', { name: t('editor.pdf.pages', { name: 'doc.pdf' }) }),
    ).toBeVisible();
  });

  it('is no tree, and no error, when it cannot be read', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const doc = await pdf.engine.open(new Uint8Array(), () => Promise.resolve(null));
    if (doc !== 'locked') doc.outline = () => Promise.reject(new Error('bad outline'));
    const reader = await opened();

    await user.click(panelButton(reader));
    await user.click(within(sidebarOf(reader)).getByRole('tab', { name: t('editor.pdf.outline') }));
    expect(await within(sidebarOf(reader)).findByText(t('editor.pdf.noOutline'))).toBeVisible();
  });
});

describe('the thumbnails — plan 21, B-13', () => {
  async function onThumbnails(
    reader: HTMLElement,
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<void> {
    await user.click(panelButton(reader));
    await user.click(
      within(sidebarOf(reader)).getByRole('tab', { name: t('editor.pdf.thumbnails') }),
    );
  }

  it('draw only near the view, two at a time, and give up one that leaves it (S-38, S-42)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    await onThumbnails(reader, user);
    const items = thumbnails(reader);
    expect(pdf.drawing()).toEqual([]);

    observers.near(items.slice(0, 4));
    expect(pdf.drawing()).toEqual([1, 2]);
    observers.near(items.slice(0, 1), false);
    await waitFor(() => {
      expect(pdf.givenUp).toContain(1);
    });
    await waitFor(() => {
      expect(pdf.drawing()).toEqual([2, 3]);
    });

    act(() => {
      pdf.drawAtOnce();
    });
    await waitFor(() => {
      expect(pdf.drawn).toEqual(expect.arrayContaining([2, 3, 4]));
    });
    expect(pdf.drawn).not.toContain(1);
  });

  it('marks the page being read, kept in sight, and takes you to the one clicked (S-39, S-40)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const reader = await opened();
    await onThumbnails(reader, user);

    expect(thumbnails(reader)[0]).toHaveAttribute('aria-current', 'page');
    act(() => {
      pdf.views.at(-1)?.scrollTo(5);
    });
    expect(thumbnails(reader)[4]).toHaveAttribute('aria-current', 'page');
    expect(thumbnails(reader)[0]).not.toHaveAttribute('aria-current');
    expect(scroll).toHaveBeenCalled();

    await user.click(thumbnails(reader)[8] as HTMLElement);
    expect(pdf.views.at(-1)?.page).toBe(9);
  });

  it('shows the number of a page that could not be drawn (S-41)', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(logger, 'warn');
    withPdf({ failing: [2] });
    const reader = await opened();
    await onThumbnails(reader, user);

    observers.near(thumbnails(reader).slice(0, 2));
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'editor.pdf.thumbnail', page: 2 }),
        expect.any(String),
      );
    });
    expect(within(thumbnails(reader)[1] as HTMLElement).getAllByText('2')).not.toHaveLength(0);
    expect(within(reader).queryByRole('alert')).toBeNull();
  });

  it('give up a drawing left behind by the double effect of StrictMode, with no failure (S-03)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    await onThumbnails(reader, user);

    observers.near(thumbnails(reader).slice(0, 1));
    observers.near(thumbnails(reader).slice(0, 1), false);
    observers.near(thumbnails(reader).slice(0, 1));
    act(() => {
      pdf.finishDrawings();
    });

    await waitFor(() => {
      expect(pdf.drawn).toContain(1);
    });
    expect(pdf.givenUp).toContain(1);
    expect(within(reader).queryByRole('alert')).toBeNull();
  });
});

describe('the search — plan 21, B-14', () => {
  it('opens with Ctrl+F only with the focus in the reader, the field focused (S-43)', async () => {
    const user = userEvent.setup();
    withPdf();
    const reader = await opened();

    expect(fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true })).toBe(true);
    expect(within(reader).queryByRole('search')).toBeNull();

    act(() => {
      within(reader)
        .getByRole('region', { name: t('editor.pdf.pages', { name: 'doc.pdf' }) })
        .focus();
    });
    await user.keyboard('{Control>}f{/Control}');
    const field = within(reader).getByRole('textbox', {
      name: t('editor.pdf.find', { name: 'doc.pdf' }),
    });
    expect(field).toHaveFocus();
  });

  it('counts and moves through the matches with Enter and Shift+Enter, round the ends (S-44, S-46)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findOpen') }));
    await user.type(
      within(reader).getByRole('textbox', { name: t('editor.pdf.find', { name: 'doc.pdf' }) }),
      'light',
    );

    const status = within(within(reader).getByRole('search')).getByRole('status');
    await waitFor(() => {
      expect(status).toHaveTextContent(t('editor.pdf.findCount', { current: 1, total: 4 }));
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(status).toHaveTextContent(t('editor.pdf.findCount', { current: 2, total: 4 }));
    });
    await user.keyboard('{Shift>}{Enter}{/Shift}{Shift>}{Enter}{/Shift}');
    await waitFor(() => {
      expect(status).toHaveTextContent(t('editor.pdf.findCount', { current: 4, total: 4 }));
    });
    expect(pdf.views.at(-1)?.searches.at(-1)).toMatchObject({ again: true, previous: true });

    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.matchCase') }));
    await waitFor(() => {
      expect(status).toHaveTextContent(t('editor.pdf.findCount', { current: 1, total: 3 }));
    });
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.wholeWord') }));
    await waitFor(() => {
      expect(status).toHaveTextContent(t('editor.pdf.findCount', { current: 1, total: 1 }));
    });
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findNext') }));
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findPrevious') }));
    expect(pdf.views.at(-1)?.searches.at(-1)).toMatchObject({
      query: 'light',
      caseSensitive: true,
      entireWord: true,
      previous: true,
    });
  });

  it('says "no results" — also for a page with no text —, and an empty field clears (S-45, S-49)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: [''], outline: [] });
    const reader = await opened();
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findOpen') }));
    const field = within(reader).getByRole('textbox', {
      name: t('editor.pdf.find', { name: 'doc.pdf' }),
    });

    await user.type(field, 'anything');
    expect(await within(reader).findByText(t('editor.pdf.findNone'))).toBeVisible();
    expect(within(reader).getByRole('button', { name: t('editor.pdf.findNext') })).toBeDisabled();

    await user.clear(field);
    expect(within(reader).queryByText(t('editor.pdf.findNone'))).toBeNull();
    expect(pdf.views.at(-1)?.closedFind).toBeGreaterThan(0);
  });

  it('closes with Esc, taking the highlight away, and reopens with the last search selected (S-47)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf();
    const reader = await opened();
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findOpen') }));
    await user.type(
      within(reader).getByRole('textbox', { name: t('editor.pdf.find', { name: 'doc.pdf' }) }),
      'dusk',
    );
    const closedBefore = pdf.views.at(-1)?.closedFind ?? 0;

    await user.keyboard('{Escape}');
    expect(within(reader).queryByRole('search')).toBeNull();
    expect(pdf.views.at(-1)?.closedFind).toBe(closedBefore + 1);
    expect(
      within(reader).getByRole('region', { name: t('editor.pdf.pages', { name: 'doc.pdf' }) }),
    ).toHaveFocus();

    await user.keyboard('{Control>}f{/Control}');
    const field = within(reader).getByRole('textbox', {
      name: t('editor.pdf.find', { name: 'doc.pdf' }),
    }) as HTMLInputElement;
    expect(field.value).toBe('dusk');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 4]);
    expect(pdf.views.at(-1)?.searches.at(-1)).toMatchObject({ query: 'dusk', again: false });

    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findClose') }));
    expect(within(reader).queryByRole('search')).toBeNull();
  });

  it('has no violation of axe with the panel and the search open (S-73, in jsdom)', async () => {
    const user = userEvent.setup();
    withPdf();
    const reader = await opened();
    await user.click(panelButton(reader));
    await within(sidebarOf(reader)).findByRole('tree');
    await user.click(within(reader).getByRole('button', { name: t('editor.pdf.findOpen') }));

    expect(await axe(reader)).toHaveNoViolations();
  });
});
