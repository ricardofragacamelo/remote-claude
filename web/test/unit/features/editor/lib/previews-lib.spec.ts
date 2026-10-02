import { describe, expect, it } from 'vitest';

import { captureEditor, keptEditorFrom, layoutFrom } from '@/features/editor/lib/kept-editor';
import { aFileTab, aPreviewTab, emptyLayout, isShown, openIn } from '@/features/editor/lib/layout';
import { resolveLink } from '@/features/editor/lib/links';
import {
  HEX_PAGE_BYTES,
  TEXT_PAGE_BYTES,
  UTF8_TAIL,
  hexRowsOf,
  pageCountOf,
  pagedModeOf,
  requestBytesOf,
  textOfPage,
} from '@/features/editor/lib/paged';
import {
  canPreview,
  opensAsPreview,
  previewKindOf,
  previewsText,
} from '@/features/editor/lib/preview-kinds';
import { AppError } from '@/shared/api/errors';

describe('what a preview of a file shows — plan 07, B-50', () => {
  it.each([
    ['README.md', 'markdown'],
    ['docs/NOTES.Markdown', 'markdown'],
    ['logo.PNG', 'image'],
    ['a/b/photo.jpeg', 'image'],
    ['icon.svg', 'svg'],
    ['spec.pdf', 'pdf'],
    ['index.html', 'html'],
    ['page.htm', 'html'],
    ['main.ts', null],
    ['.md', null],
    ['Makefile', null],
  ] as const)('%s is %s', (path, kind) => {
    expect(previewKindOf(path)).toBe(kind);
    expect(canPreview(path)).toBe(kind !== null);
  });

  it('draws markdown and HTML from the text, and opens images and PDFs as their picture', () => {
    expect([previewsText('a.md'), previewsText('a.html'), previewsText('a.png')]).toEqual([
      true,
      true,
      false,
    ]);
    expect([opensAsPreview('a.png'), opensAsPreview('a.pdf'), opensAsPreview('a.svg')]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('keeps a preview tab across a reload, and a buffer lives while its preview shows it', () => {
    let layout = openIn(emptyLayout(), aFileTab('a.md', false), false);
    layout = openIn(layout, aPreviewTab('a.md', true), true);
    const kept = captureEditor({ ...layout, recent: [] });

    expect(kept.groups[1]?.tabs).toEqual([
      { kind: 'preview', path: 'a.md', preview: true, pinned: false },
    ]);
    const back = layoutFrom(keptEditorFrom(JSON.parse(JSON.stringify(kept))) ?? kept);
    expect(back.groups[1]?.tabs[0]).toMatchObject({ id: 'preview:a.md', kind: 'preview' });

    const previewOnly = openIn(emptyLayout(), aPreviewTab('b.md', false), false);
    expect(isShown(previewOnly, 'b.md')).toBe(true);
  });
});

describe('where a relative link of a markdown file leads — plan 07, S-308', () => {
  it.each([
    ['docs/README.md', 'guide.md', 'docs/guide.md'],
    ['docs/README.md', './img/a.png', 'docs/img/a.png'],
    ['docs/README.md', '../src/main.ts#L10', 'src/main.ts'],
    ['docs/README.md', '/LICENSE?plain=1', 'LICENSE'],
    ['README.md', 'my%20file.md', 'my file.md'],
    ['a/b/c.md', '..//x.md', 'a/x.md'],
  ] as const)('from %s, %s is %s', (from, href, to) => {
    expect(resolveLink(from, href)).toBe(to);
  });

  it.each([
    ['README.md', '../outside.md'],
    ['README.md', '#top'],
    ['README.md', '%E0%A4%A'],
    ['docs/a.md', '..'],
  ])('from %s, %s leads nowhere in the folder', (from, href) => {
    expect(resolveLink(from, href)).toBeNull();
  });
});

describe('the paged views — plan 07, B-51', () => {
  it('picks the view by the refusal: hex for binary, text past the ceiling, none otherwise', () => {
    const refusal = (code: string, params = {}) => new AppError(code, 'k', 't', params);

    expect(pagedModeOf(refusal('FILE_NOT_TEXT', { reason: 'binary' }))).toBe('hex');
    expect(pagedModeOf(refusal('FILE_NOT_TEXT', { reason: 'encoding' }))).toBeNull();
    expect(pagedModeOf(refusal('FILE_TOO_LARGE'))).toBe('text');
    expect(pagedModeOf(refusal('FILE_NOT_FOUND'))).toBeNull();
    expect(pagedModeOf(null)).toBeNull();
  });

  it('counts the pages, one for an empty file, and asks a few bytes past a page of text (S-315)', () => {
    expect(pageCountOf(0, 'hex')).toBe(1);
    expect(pageCountOf(HEX_PAGE_BYTES, 'hex')).toBe(1);
    expect(pageCountOf(HEX_PAGE_BYTES + 1, 'hex')).toBe(2);
    expect(pageCountOf(TEXT_PAGE_BYTES * 3, 'text')).toBe(3);
    expect(requestBytesOf('hex')).toBe(HEX_PAGE_BYTES);
    expect(requestBytesOf('text')).toBe(TEXT_PAGE_BYTES + UTF8_TAIL);
  });

  it('writes rows of sixteen bytes, the last one as short as the file', () => {
    const rows = hexRowsOf(Uint8Array.from([0x41, 0x00, 0x7f, 0x20, ...Array(14).fill(0x42)]), 32);

    expect(rows).toEqual([
      {
        offset: '00000020',
        hex: '41 00 7f 20 42 42 42 42 42 42 42 42 42 42 42 42',
        text: 'A.. BBBBBBBBBBBB',
      },
      { offset: '00000030', hex: '42 42', text: 'BB' },
    ]);
    expect(hexRowsOf(new Uint8Array(0), 0)).toEqual([]);
  });

  it('cuts a page of text at whole characters on both ends', () => {
    const encoded = new TextEncoder().encode('ééé');

    // The page before ended in the middle of the first "é": its continuation byte is skipped.
    expect(textOfPage(encoded.subarray(1), 3, false)).toBe('é');
    // The page ends in the middle of a character: the bytes asked past it finish it.
    expect(textOfPage(encoded, 3, true)).toBe('éé');
    expect(textOfPage(encoded, 10, true)).toBe('ééé');
  });
});

describe('a refusal of a preview — plan 07, B-50', () => {
  it('says the download ceiling in the person’s units, and leaves any other refusal as it came', async () => {
    const { previewError } = await import('@/features/editor/lib/preview-errors');
    const other = new AppError('FILE_NOT_FOUND', 'files.error.notFound', 't');

    expect(previewError(other, 'a.png', 'en')).toBe(other);
    expect(
      previewError(
        new AppError('FILE_TOO_LARGE', 'files.error.tooLarge', 't', { limit: 2_000_000 }),
        'a.png',
        'en',
      ),
    ).toMatchObject({
      messageKey: 'editor.preview.tooLarge',
      params: { path: 'a.png', limit: '2 MB' },
    });
    expect(
      previewError(new AppError('FILE_TOO_LARGE', 'files.error.tooLarge', 't'), 'a.png', 'en')
        .params,
    ).toMatchObject({ limit: '0 byte' });
  });
});
