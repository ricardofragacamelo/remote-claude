import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile, openPreview } from '@/features/editor';
import { setPdfLoader } from '@/features/editor/lib/pdf-loader';
import { editorStoreOf, forgetEditor } from '@/features/editor/store/editor.store';
import { logger } from '@/shared/logging/logger';
import { FOLDER, renderEditor, watched } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { aLiveSocket } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { aFakePdf, FAKE_FITS } from '../../../support/pdf-fake';
import type { FakePdf, FakePdfOptions } from '../../../support/pdf-fake';
import { fakeRaw } from '../../../support/raw-api';
import { translator } from '../../../support/render';

const t = translator('en');
let socket: LiveSocket;

beforeEach(() => {
  socket = aLiveSocket();
  socket.connect();
});

afterEach(() => {
  socket.close();
  vi.restoreAllMocks();
  setPdfLoader();
  forgetEditor(null);
});

/** The fake PDF engine, standing in for pdf.js, and the folder with the PDFs on its disk. */
function withPdf(options: FakePdfOptions, files: readonly string[] = ['doc.pdf']): FakePdf {
  const pdf = aFakePdf(options);
  setPdfLoader(() => Promise.resolve(pdf.engine));
  fakeDisk(FOLDER, {});
  fakeRaw(FOLDER, Object.fromEntries(files.map((file) => [file, '%PDF-1.7'])));
  return pdf;
}

function open(path: string): void {
  act(() => {
    openFile(FOLDER, path);
  });
}

/** The reader of a PDF, once its pages are laid out. */
async function readerOf(name: string): Promise<HTMLElement> {
  const reader = await screen.findByRole('group', { name: t('editor.pdf.reader', { name }) });
  await waitFor(() => {
    expect(within(reader).getByRole('textbox', { name: t('editor.pdf.pageField') })).toBeEnabled();
  });
  return reader;
}

function pageField(reader: HTMLElement): HTMLInputElement {
  return within(reader).getByRole('textbox', {
    name: t('editor.pdf.pageField'),
  }) as HTMLInputElement;
}

function zoomList(reader: HTMLElement): HTMLSelectElement {
  return within(reader).getByRole('combobox', { name: t('editor.pdf.zoom') }) as HTMLSelectElement;
}

function button(reader: HTMLElement, key: string): HTMLElement {
  return within(reader).getByRole('button', { name: t(key) });
}

function pagesOf(reader: HTMLElement, name: string): HTMLElement {
  return within(reader).getByRole('region', { name: t('editor.pdf.pages', { name }) });
}

describe('the PDF reader — plan 21, F1', () => {
  it('lays every page out in one scroll, the indicator following it (S-08)', async () => {
    const pdf = withPdf({ pages: 5 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    const reader = await readerOf('doc.pdf');
    const pages = pagesOf(reader, 'doc.pdf');
    for (const page of [1, 2, 3, 4, 5]) {
      expect(
        within(pages).getByRole('region', { name: t('editor.pdf.pageLabel', { page }) }),
      ).toBeInTheDocument();
    }
    expect(pageField(reader).value).toBe('1');
    expect(within(reader).getByText(t('editor.pdf.pageCount', { pages: 5 }))).toBeVisible();

    act(() => {
      pdf.views.at(-1)?.scrollTo(4);
    });
    expect(pageField(reader).value).toBe('4');
    expect(within(reader).getByRole('status')).toHaveTextContent(
      t('editor.pdf.pageStatus', { page: 4, pages: 5 }),
    );
    // StrictMode laid the reader out twice: the first one was let go of.
    expect(pdf.views.filter((view) => !view.destroyed)).toHaveLength(1);
  });

  it('goes to page 1 and the last; 0, past the end, empty and text stay where it was (S-09)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 12 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');
    const field = pageField(reader);

    for (const [typed, expected] of [
      ['12', 12],
      ['1', 1],
      ['0', 1],
      ['13', 1],
      ['abc', 1],
      ['', 1],
      [' 7 ', 7],
    ] as const) {
      await user.clear(field);
      if (typed !== '') await user.type(field, typed);
      await user.keyboard('{Enter}');
      expect(pdf.views.at(-1)?.page).toBe(expected);
      expect(field.value).toBe(String(expected));
    }

    await user.clear(field);
    await user.type(field, '3');
    await user.keyboard('{Escape}');
    expect(field.value).toBe('7');
    await user.type(field, '9');
    fireEvent.blur(field);
    expect(field.value).toBe('7');
  });

  it('turns previous and next off at the ends, and Home and End go there (S-11)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 3 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');

    expect(button(reader, 'editor.pdf.previous')).toBeDisabled();
    await user.click(button(reader, 'editor.pdf.next'));
    await user.click(button(reader, 'editor.pdf.next'));
    expect(pageField(reader).value).toBe('3');
    expect(button(reader, 'editor.pdf.next')).toBeDisabled();
    await user.click(button(reader, 'editor.pdf.previous'));
    expect(pdf.views.at(-1)?.page).toBe(2);

    // Home and End, with the focus in the pages.
    const pages = pagesOf(reader, 'doc.pdf');
    act(() => {
      pages.focus();
    });
    await user.keyboard('{End}');
    expect(pdf.views.at(-1)?.page).toBe(3);
    await user.keyboard('{Home}');
    expect(pdf.views.at(-1)?.page).toBe(1);
    await user.keyboard('{Control>}{End}{/Control}');
    expect(pdf.views.at(-1)?.page).toBe(1);
  });

  it('turns both off for a PDF of one page, "1 of 1" (S-10)', async () => {
    withPdf({ pages: 1 }, ['one.pdf']);
    renderEditor(FOLDER, { strict: true });
    open('one.pdf');
    const single = await readerOf('one.pdf');
    expect(within(single).getByText(t('editor.pdf.pageCount', { pages: 1 }))).toBeVisible();
    expect(button(single, 'editor.pdf.previous')).toBeDisabled();
    expect(button(single, 'editor.pdf.next')).toBeDisabled();
  });

  it('opens fitted to the width, and zooms by the steps, off at 25 % and 500 % (S-12, S-16)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 2 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');
    const view = () => pdf.views.at(-1);

    expect(view()?.scale).toBe('page-width');
    expect(zoomList(reader).value).toBe('page-width');

    // 130 % — the fit — then the steps after it.
    await user.click(button(reader, 'editor.pdf.zoomIn'));
    expect(view()?.scale).toBe(1.5);
    await user.click(button(reader, 'editor.pdf.zoomOut'));
    await user.click(button(reader, 'editor.pdf.zoomOut'));
    expect(view()?.scale).toBe(1);

    await user.selectOptions(zoomList(reader), t('editor.pdf.zoomPercent', { value: 25 }));
    expect(button(reader, 'editor.pdf.zoomOut')).toBeDisabled();
    await user.selectOptions(zoomList(reader), t('editor.pdf.zoomPercent', { value: 500 }));
    expect(button(reader, 'editor.pdf.zoomIn')).toBeDisabled();
    expect(button(reader, 'editor.pdf.zoomOut')).toBeEnabled();
    await user.click(button(reader, 'editor.pdf.zoomOut'));
    expect(view()?.scale).toBe(4);
  });

  it('chooses each fit and each percent from the list; a factor of no step is shown as it is (S-13)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 2 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');
    const list = zoomList(reader);

    for (const [label, scale] of [
      ['editor.pdf.zoomPageFit', 'page-fit'],
      ['editor.pdf.zoomAuto', 'auto'],
      ['editor.pdf.zoomPageWidth', 'page-width'],
    ] as const) {
      await user.selectOptions(list, t(label));
      expect(pdf.views.at(-1)?.scale).toBe(scale);
      expect(list.value).toBe(scale);
    }
    await user.selectOptions(list, t('editor.pdf.zoomPercent', { value: 200 }));
    expect(pdf.views.at(-1)?.scale).toBe(2);

    act(() => {
      pdf.views.at(-1)?.setScale(1.1);
    });
    expect(
      within(list).getByRole('option', { name: t('editor.pdf.zoomPercent', { value: 110 }) }),
    ).toBeInTheDocument();
    expect(list.value).toBe('1.1');
    expect(FAKE_FITS['page-width']).toBe(1.3);
  });

  it('zooms with Ctrl+=, Ctrl+- and Ctrl+0, and Ctrl with the wheel — only with the focus or the pointer there (S-14)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 2 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');
    const pages = pagesOf(reader, 'doc.pdf');
    const view = () => pdf.views.at(-1);

    // Outside the reader: the keys are the browser's.
    const outside = fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(outside).toBe(true);
    expect(view()?.scale).toBe('page-width');

    act(() => {
      pages.focus();
    });
    await user.keyboard('{Control>}={/Control}');
    expect(view()?.scale).toBe(1.5);
    await user.keyboard('{Control>}-{/Control}');
    expect(view()?.scale).toBe(1.25);
    await user.keyboard('{Control>}0{/Control}');
    expect(view()?.scale).toBe('page-width');

    // The wheel with Ctrl zooms, and the page of the browser does not.
    const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    act(() => {
      pages.dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(view()?.scale).toBe(1.5);
    act(() => {
      pages.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, ctrlKey: true, cancelable: true }));
    });
    expect(view()?.scale).toBe(1.5);
    act(() => {
      pages.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, ctrlKey: true, cancelable: true }));
    });
    expect(view()?.scale).toBe(1.25);
    const plain = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    act(() => {
      pages.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);

    // The pointer over the reader, the focus somewhere else.
    act(() => {
      pages.blur();
    });
    fireEvent.pointerEnter(reader);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(view()?.scale).toBe(1.5);
    fireEvent.pointerLeave(reader);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(view()?.scale).toBe(1.5);
  });

  it('asks for the password, opens with the right one, and keeps it out of logs, storage and the store (S-21)', async () => {
    const user = userEvent.setup();
    const debug = vi.spyOn(logger, 'debug');
    const pdf = withPdf({ pages: 2, password: 'open sesame' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    const field = await screen.findByLabelText(t('editor.pdf.passwordField'));
    expect(screen.getByText(t('editor.pdf.passwordNeeded'))).toBeVisible();
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.type(field, 'open sesame');
    await user.click(screen.getByRole('button', { name: t('editor.pdf.passwordOpen') }));

    await readerOf('doc.pdf');
    expect(pdf.tried).toEqual(['open sesame']);
    const everywhere = JSON.stringify([
      debug.mock.calls,
      { ...localStorage },
      { ...sessionStorage },
      window.location.href,
      editorStoreOf(FOLDER).getState().readers,
    ]);
    expect(everywhere).not.toContain('open sesame');
  });

  it('says a wrong password is wrong and asks again with the field empty (S-22)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 2, password: 'right' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    await user.type(await screen.findByLabelText(t('editor.pdf.passwordField')), 'wrong');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(t('editor.pdf.passwordIncorrect'));
    const again = screen.getByLabelText(t('editor.pdf.passwordField'));
    expect(again).toHaveValue('');
    await user.type(again, 'right');
    await user.keyboard('{Enter}');
    await readerOf('doc.pdf');
    expect(pdf.tried).toEqual(['wrong', 'right']);
  });

  it('says "protected" when the person gives up, and asks again on "try again" (S-23)', async () => {
    const user = userEvent.setup();
    withPdf({ pages: 2, password: 'right' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    await screen.findByLabelText(t('editor.pdf.passwordField'));
    await user.click(screen.getByRole('button', { name: t('editor.pdf.passwordCancel') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('editor.pdf.protected', { name: 'doc.pdf' }),
    );

    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await screen.findByLabelText(t('editor.pdf.passwordField'))).toBeVisible();
  });

  it('tries a password sent twice in a row once (S-24)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 2, password: 'right' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    const field = await screen.findByLabelText(t('editor.pdf.passwordField'));
    await user.type(field, 'wrong');
    const form = field.closest('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(t('editor.pdf.passwordIncorrect'));
    expect(pdf.tried).toEqual(['wrong']);

    // An empty field sends nothing.
    fireEvent.submit(
      screen.getByLabelText(t('editor.pdf.passwordField')).closest('form') as HTMLFormElement,
    );
    expect(pdf.tried).toEqual(['wrong']);
    expect(screen.getByRole('button', { name: t('editor.pdf.passwordOpen') })).toBeDisabled();
  });

  it('gives a tab back its page, zoom and panel; two PDFs, and one PDF in two groups, each keep their own (S-25, S-26)', async () => {
    const user = userEvent.setup();
    const pdf = withPdf({ pages: 9 }, ['a.pdf', 'b.pdf']);
    renderEditor(FOLDER, { strict: true });
    act(() => {
      openFile(FOLDER, 'a.pdf', { preview: false });
    });
    const a = await readerOf('a.pdf');
    await user.clear(pageField(a));
    await user.type(pageField(a), '6{Enter}');
    await user.selectOptions(zoomList(a), t('editor.pdf.zoomPercent', { value: 300 }));

    act(() => {
      openFile(FOLDER, 'b.pdf', { preview: false });
    });
    const b = await readerOf('b.pdf');
    expect(pageField(b).value).toBe('1');
    expect(zoomList(b).value).toBe('page-width');

    act(() => {
      openFile(FOLDER, 'a.pdf');
    });
    const back = await readerOf('a.pdf');
    await waitFor(() => {
      expect(pageField(back).value).toBe('6');
    });
    expect(zoomList(back).value).toBe('3');
    expect(pdf.views.at(-1)?.page).toBe(6);

    // The same PDF in a second group: its own place.
    act(() => {
      openPreview(FOLDER, 'a.pdf', { toSide: true });
    });
    await waitFor(() => {
      expect(
        screen.getAllByRole('group', { name: t('editor.pdf.reader', { name: 'a.pdf' }) }),
      ).toHaveLength(2);
    });
    const [first, second] = screen.getAllByRole('group', {
      name: t('editor.pdf.reader', { name: 'a.pdf' }),
    });
    await waitFor(() => {
      expect(pageField(second as HTMLElement)).toBeEnabled();
    });
    expect(pageField(second as HTMLElement).value).toBe('1');
    expect(pageField(first as HTMLElement).value).toBe('6');
  });

  it('starts over after a reload: page 1, fitted to the width (S-27)', async () => {
    const user = userEvent.setup();
    withPdf({ pages: 4 });
    const first = renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const reader = await readerOf('doc.pdf');
    await user.click(button(reader, 'editor.pdf.next'));
    expect(Object.values(editorStoreOf(FOLDER).getState().readers)).toEqual([
      expect.objectContaining({ page: 2 }),
    ]);

    // A reload: the page is gone, and what was in memory with it.
    first.unmount();
    forgetEditor(null);
    expect(JSON.stringify({ ...localStorage })).not.toContain('"page"');
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const again = await readerOf('doc.pdf');
    expect(pageField(again).value).toBe('1');
    expect(zoomList(again).value).toBe('page-width');
  });

  it('opens the PDF again when it changes on disk, on the same page — or the last, when it is gone (S-28)', async () => {
    const pdf = withPdf({ pages: 8 });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    const folder = await watched(socket);
    const reader = await readerOf('doc.pdf');
    act(() => {
      pdf.views.at(-1)?.scrollTo(5);
    });
    const before = pdf.views.length;

    folder.changed([{ path: 'other.pdf', kind: 'changed' }]);
    folder.changed([{ path: 'doc.pdf', kind: 'changed', origin: 'claude' }]);

    await waitFor(() => {
      expect(pdf.views.length).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(pdf.views.at(-1)?.page).toBe(5);
    });
    expect(pdf.destroyed()).toBeGreaterThanOrEqual(1);
    expect(pageField(await readerOf('doc.pdf')).value).toBe('5');
    expect(reader).not.toBeInTheDocument();
  });

  it('says why a corrupt PDF or a reader that did not load cannot be shown, with "try again" (S-29)', async () => {
    const user = userEvent.setup();
    const broken = aFakePdf({ pages: 1, corrupt: true });
    let loads = 0;
    setPdfLoader(() => {
      loads += 1;
      return loads === 1 ? Promise.reject(new Error('chunk')) : Promise.resolve(broken.engine);
    });
    fakeDisk(FOLDER, {});
    fakeRaw(FOLDER, { 'doc.pdf': 'not a pdf' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');

    expect(await screen.findByText(t('editor.preview.pdfLoadFailed'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(
      await screen.findByText(t('editor.preview.pdfBroken', { name: 'doc.pdf' })),
    ).toBeVisible();
  });

  it('lets go of a PDF whose preview closed while it opened, or while it was read (S-30)', async () => {
    const pdf = withPdf({ pages: 3 }, ['doc.pdf', 'locked.pdf']);
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    await readerOf('doc.pdf');

    act(() => {
      openFile(FOLDER, 'other.ts');
    });
    await waitFor(() => {
      expect(pdf.views.every((view) => view.destroyed)).toBe(true);
    });
    await waitFor(() => {
      expect(pdf.destroyed()).toBeGreaterThanOrEqual(1);
    });
  });

  it('gives up a password still asked for when the preview closes (S-30)', async () => {
    const pdf = withPdf({ pages: 2, password: 'right' });
    renderEditor(FOLDER, { strict: true });
    open('doc.pdf');
    await screen.findByLabelText(t('editor.pdf.passwordField'));

    act(() => {
      openFile(FOLDER, 'other.ts');
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(t('editor.pdf.passwordField'))).toBeNull();
    });
    expect(pdf.tried).toEqual([]);
    expect(pdf.views).toHaveLength(0);
  });
});
