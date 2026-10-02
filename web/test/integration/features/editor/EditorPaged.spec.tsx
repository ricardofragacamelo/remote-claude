import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile } from '@/features/editor';
import { HEX_PAGE_BYTES, TEXT_PAGE_BYTES } from '@/features/editor/lib/paged';
import { FOLDER, renderEditor } from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { fakeRaw, rawVersionOf } from '../../../support/raw-api';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

const BINARY = refused('FILE_NOT_TEXT', 'files.error.notText', { reason: 'binary' });

function open(path: string): void {
  act(() => {
    openFile(FOLDER, path);
  });
}

/** `count` bytes, each its offset modulo 256 — row `n` starts with byte `16n`. */
function bytes(count: number): Uint8Array {
  return Uint8Array.from({ length: count }, (_, index) => index % 256);
}

function pageLabel(page: number, pages: number): string {
  return t('editor.paged.page', { page, pages });
}

function controls(path: string): HTMLElement {
  return screen.getByRole('navigation', { name: t('editor.paged.controls', { path }) });
}

describe('the hexadecimal view and the paged reading — plan 07, B-51', () => {
  it('opens a binary file in hexadecimal, read-only, a page at a time by Range (S-314)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'data.bin': { content: '', unreadable: BINARY } });
    const raw = fakeRaw(FOLDER, { 'data.bin': bytes(HEX_PAGE_BYTES * 2 + 100) });
    renderEditor();
    open('data.bin');

    expect(await screen.findByText(t('editor.paged.hexTitle', { path: 'data.bin' }))).toBeVisible();
    const table = await screen.findByRole('table', {
      name: t('editor.paged.tableLabel', { path: 'data.bin', from: 0, to: HEX_PAGE_BYTES - 1 }),
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(HEX_PAGE_BYTES / 16 + 1);
    expect(rows[1]).toHaveTextContent('00000000');
    expect(rows[1]).toHaveTextContent('00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f');
    expect(rows[3]).toHaveTextContent(' !"#$%&\'()*+,-./');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(pageLabel(1, 3))).toBeVisible();

    await user.click(
      within(controls('data.bin')).getByRole('button', { name: t('editor.paged.next') }),
    );
    expect(await screen.findByText(pageLabel(2, 3))).toBeVisible();
    await screen.findByRole('table', {
      name: t('editor.paged.tableLabel', {
        path: 'data.bin',
        from: HEX_PAGE_BYTES,
        to: HEX_PAGE_BYTES * 2 - 1,
      }),
    });

    const version = rawVersionOf(bytes(HEX_PAGE_BYTES * 2 + 100));
    expect(raw.calls.map((call) => call.headers)).toEqual([
      { range: `bytes=0-${String(HEX_PAGE_BYTES - 1)}` },
      {
        range: `bytes=${String(HEX_PAGE_BYTES)}-${String(HEX_PAGE_BYTES * 2 - 1)}`,
        'if-match': version,
      },
    ]);
    for (const call of raw.calls) {
      expect(call.url).not.toMatch(/token|bearer/i);
    }
  });

  it('reads a zero-byte file and a short last page (S-315)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, {
      'empty.bin': { content: '', unreadable: BINARY },
      'short.bin': { content: '', unreadable: BINARY },
    });
    fakeRaw(FOLDER, { 'empty.bin': new Uint8Array(0), 'short.bin': bytes(HEX_PAGE_BYTES + 20) });
    renderEditor();

    open('empty.bin');
    expect(await screen.findByText(t('editor.paged.empty', { path: 'empty.bin' }))).toBeVisible();
    expect(screen.getByText(pageLabel(1, 1))).toBeVisible();
    expect(
      within(controls('empty.bin')).getByRole('button', { name: t('editor.paged.next') }),
    ).toBeDisabled();

    open('short.bin');
    await screen.findByText(pageLabel(1, 2));
    await user.click(
      within(controls('short.bin')).getByRole('button', { name: t('editor.paged.last') }),
    );
    const table = await screen.findByRole('table', {
      name: t('editor.paged.tableLabel', {
        path: 'short.bin',
        from: HEX_PAGE_BYTES,
        to: HEX_PAGE_BYTES + 19,
      }),
    });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[2]?.textContent).toBe('0000101010 11 12 13....');
    expect(
      within(controls('short.bin')).getByRole('button', { name: t('editor.paged.last') }),
    ).toBeDisabled();

    await user.click(
      within(controls('short.bin')).getByRole('button', { name: t('editor.paged.first') }),
    );
    expect(await screen.findByText(pageLabel(1, 2))).toBeVisible();
    await user.click(
      within(controls('short.bin')).getByRole('button', { name: t('editor.paged.next') }),
    );
    await user.click(
      within(controls('short.bin')).getByRole('button', { name: t('editor.paged.previous') }),
    );
    expect(await screen.findByText(pageLabel(1, 2))).toBeVisible();
  });

  it('opens a text past the editing ceiling as pages of text, read-only, saying why — whole characters only (S-316)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, {
      'huge.log': {
        content: '',
        unreadable: refused('FILE_TOO_LARGE', 'files.error.tooLarge', {
          size: 25_000_000,
          limit: 10_000_000,
          measure: 'bytes',
        }),
      },
    });
    // An "é" (two bytes) across the end of the first page.
    const text = `${'a'.repeat(TEXT_PAGE_BYTES - 1)}é${'b'.repeat(10)}`;
    fakeRaw(FOLDER, { 'huge.log': text });
    renderEditor();
    open('huge.log');

    expect(
      await screen.findByText(t('editor.paged.textTitle', { path: 'huge.log' })),
    ).toBeVisible();
    expect(screen.getByText(/25 MB/)).toHaveTextContent(/10 MB/);
    const first = await screen.findByLabelText(
      t('editor.paged.textLabel', { path: 'huge.log', page: 1 }),
    );
    expect(first.textContent?.endsWith('aé')).toBe(true);
    expect(first.textContent).not.toMatch(/�/);
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(
      within(controls('huge.log')).getByRole('button', { name: t('editor.paged.next') }),
    );
    const second = await screen.findByLabelText(
      t('editor.paged.textLabel', { path: 'huge.log', page: 2 }),
    );
    expect(second).toHaveTextContent(/^b{10}$/);
  });

  it('says so when the file changes between pages, and reads it again on the new version — never two versions (S-317)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'data.bin': { content: '', unreadable: BINARY } });
    const raw = fakeRaw(FOLDER, { 'data.bin': bytes(HEX_PAGE_BYTES * 2) });
    renderEditor();
    open('data.bin');
    await screen.findByText(pageLabel(1, 2));

    const changed = bytes(HEX_PAGE_BYTES * 3).map((byte) => 255 - byte);
    raw.files.set('data.bin', changed);
    await user.click(
      within(controls('data.bin')).getByRole('button', { name: t('editor.paged.next') }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('editor.paged.changed', { path: 'data.bin' }),
    );
    const table = await screen.findByRole('table', {
      name: t('editor.paged.tableLabel', {
        path: 'data.bin',
        from: HEX_PAGE_BYTES,
        to: HEX_PAGE_BYTES * 2 - 1,
      }),
    });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('ff fe fd fc');
    expect(screen.getByText(pageLabel(2, 3))).toBeVisible();

    // The read that was refused named the old version; the one after it names none, and the next
    // page names the new one.
    expect(raw.calls.map((call) => call.headers['if-match'] ?? null)).toEqual([
      null,
      rawVersionOf(bytes(HEX_PAGE_BYTES * 2)),
      null,
    ]);
    await user.click(
      within(controls('data.bin')).getByRole('button', { name: t('editor.paged.next') }),
    );
    await screen.findByText(pageLabel(3, 3));
    expect(raw.calls.at(-1)?.headers['if-match']).toBe(rawVersionOf(changed));

    await user.click(screen.getByRole('button', { name: t('editor.paged.dismiss') }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('starts over on the first page when the new version is shorter than the page on screen', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'data.bin': { content: '', unreadable: BINARY } });
    const raw = fakeRaw(FOLDER, { 'data.bin': bytes(HEX_PAGE_BYTES * 2) });
    renderEditor();
    open('data.bin');
    await screen.findByText(pageLabel(1, 2));

    raw.files.set('data.bin', bytes(10));
    await user.click(
      within(controls('data.bin')).getByRole('button', { name: t('editor.paged.next') }),
    );
    expect(
      await screen.findByRole('table', {
        name: t('editor.paged.tableLabel', { path: 'data.bin', from: 0, to: 9 }),
      }),
    ).toBeVisible();
    expect(screen.getByText(pageLabel(1, 1))).toBeVisible();
  });

  it('says why a page did not arrive, and reads it again', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'data.bin': { content: '', unreadable: BINARY } });
    const raw = fakeRaw(FOLDER, { 'data.bin': bytes(32) });
    raw.refuseNext(
      '/files/raw',
      refused('FILE_ACCESS_DENIED', 'files.error.accessDenied', { path: 'data.bin' }),
    );
    renderEditor();
    open('data.bin');

    expect(
      await screen.findByText(t('files.error.accessDenied', { path: 'data.bin' })),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('says a ceiling the refusal did not number as zero', async () => {
    fakeDisk(FOLDER, {
      'big.log': { content: '', unreadable: refused('FILE_TOO_LARGE', 'files.error.tooLarge') },
    });
    fakeRaw(FOLDER, { 'big.log': 'x' });
    renderEditor();
    open('big.log');

    expect(await screen.findByText(t('editor.paged.textTitle', { path: 'big.log' }))).toBeVisible();
    expect(screen.getAllByText(/0 byte/)).toHaveLength(1);
  });

  it('has no accessibility violation in the hexadecimal view (S-324)', async () => {
    fakeDisk(FOLDER, { 'data.bin': { content: '', unreadable: BINARY } });
    fakeRaw(FOLDER, { 'data.bin': bytes(64) });
    const { container } = renderEditor();
    open('data.bin');
    await screen.findByRole('table');

    expect(await axe(container)).toHaveNoViolations();
  });
});
