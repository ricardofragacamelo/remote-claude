import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile, openPreview } from '@/features/editor';
import { aPreviewTab, emptyLayout, openIn } from '@/features/editor/lib/layout';
import { setPdfLoader } from '@/features/editor/lib/pdf-loader';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import type { PdfDocument, PdfEngine } from '@/features/editor/types/pdf';
import {
  FOLDER,
  editorOf,
  editorState,
  renderEditor,
  stripOf,
  typeInto,
} from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { fakeObjectUrls, fakeRaw } from '../../../support/raw-api';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  setPdfLoader();
  delete (window as { ran?: boolean }).ran;
});

/** A group of the editor area, by its place. */
function group(place = 1): HTMLElement {
  return screen.getByRole('region', { name: t('editor.group.label', { place }) });
}

/** The preview of a file, once it is on screen. */
function previewOf(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: t('editor.preview.label', { name }) });
}

function open(path: string): void {
  act(() => {
    openFile(FOLDER, path);
  });
}

const README = [
  '# Title',
  '',
  '<script>window.ran = true</script>',
  '<img src="x" onerror="window.ran = true">',
  '',
  '<b>bold</b> text',
  '',
  '[guide](docs/guide.md) [out](../../etc/passwd) [web](https://example.com/a) [bad](javascript:alert(1))',
  '',
  '![logo](img/logo.png) ![remote](https://example.com/x.png) ![data](data:image/png;base64,AAAA)',
].join('\n');

/** A PDF engine that draws nothing, and says which page it was asked for. */
function aPdfEngine(
  pages: number,
  fail?: Error,
): { engine: PdfEngine; drawn: number[]; destroyed: () => number } {
  const drawn: number[] = [];
  let destroyed = 0;
  const doc: PdfDocument = {
    pageCount: pages,
    renderPage: (page) => {
      drawn.push(page);
      return page === 3 ? Promise.reject(new Error('page')) : Promise.resolve();
    },
    destroy: () => {
      destroyed += 1;
    },
  };

  return {
    engine: { open: () => (fail === undefined ? Promise.resolve(doc) : Promise.reject(fail)) },
    drawn,
    destroyed: () => destroyed,
  };
}

/**
 * A PDF engine that keeps the rule of pdf.js: one drawing on a canvas at a time, a second one
 * refused until the first is done or given up on. A drawing ends when the test says so.
 */
function aStrictPdfEngine(pages: number): {
  engine: PdfEngine;
  finish: () => void;
  givenUp: () => number[];
} {
  const inUse = new WeakSet<HTMLCanvasElement>();
  const pending: (() => void)[] = [];
  const givenUp: number[] = [];
  const doc: PdfDocument = {
    pageCount: pages,
    renderPage: (page, canvas, _scale, signal) => {
      if (inUse.has(canvas)) {
        return Promise.reject(new Error('Cannot use the same canvas during multiple render()'));
      }
      inUse.add(canvas);
      return new Promise<void>((resolve) => {
        const done = (): void => {
          inUse.delete(canvas);
          resolve();
        };
        signal.addEventListener('abort', () => {
          givenUp.push(page);
          done();
        });
        pending.push(done);
      });
    },
    destroy: () => undefined,
  };

  return {
    engine: { open: () => Promise.resolve(doc) },
    finish: () => {
      for (const done of pending.splice(0)) {
        done();
      }
    },
    givenUp: () => givenUp,
  };
}

describe('previews — plan 07, B-50', () => {
  it('renders markdown safely: raw HTML never runs, a link to a file opens it, a relative image loads through raw (S-308)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'README.md': README, 'docs/guide.md': '# Guide' });
    const raw = fakeRaw(FOLDER, { 'img/logo.png': 'PNG' });
    fakeObjectUrls();
    renderEditor();
    act(() => {
      openPreview(FOLDER, 'README.md');
    });

    const preview = await previewOf('README.md');
    expect(await within(preview).findByRole('heading', { name: 'Title' })).toBeVisible();
    expect(preview.querySelector('script, iframe, [onerror], b')).toBeNull();
    expect(within(preview).getByText(/bold/)).toBeVisible();
    expect((window as { ran?: boolean }).ran).toBeUndefined();

    expect(within(preview).getByRole('link', { name: 'web' })).toHaveAttribute('target', '_blank');
    expect(within(preview).queryByRole('link', { name: 'bad' })).toBeNull();
    expect(
      within(preview).getByRole('link', { name: t('markdown.image.remote', { name: 'remote' }) }),
    ).toHaveAttribute('href', 'https://example.com/x.png');
    expect(within(preview).queryByRole('img', { name: 'data' })).toBeNull();

    const logo = await within(preview).findByRole('img', { name: 'logo' });
    expect(logo.getAttribute('src')).toMatch(/^blob:/);
    expect(raw.calls.map((call) => call.query.get('path'))).toEqual(['img/logo.png']);

    // A link out of the folder does nothing; one to a file of it opens that file.
    await user.click(within(preview).getByRole('link', { name: 'out' }));
    await user.click(within(preview).getByRole('link', { name: 'guide' }));
    expect(await editorOf('guide.md')).toHaveValue('# Guide');
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual([
      'preview:README.md',
      'file:docs/guide.md',
    ]);
  });

  it('shows an image and an SVG as a blob fetched with the credential in the header — no token in any URL (S-309, S-310)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>window.ran = true</script></svg>';
    fakeDisk(FOLDER, {});
    const raw = fakeRaw(FOLDER, { 'logo.png': 'PNG', 'icon.svg': svg });
    const urls = fakeObjectUrls();
    renderEditor();

    open('logo.png');
    const image = await within(await previewOf('logo.png')).findByRole('img', { name: 'logo.png' });
    expect(image.getAttribute('src')).toMatch(/^blob:/);

    act(() => {
      openPreview(FOLDER, 'icon.svg');
    });
    const icon = await within(await previewOf('icon.svg')).findByRole('img', { name: 'icon.svg' });
    expect(icon.tagName).toBe('IMG');
    expect(icon.getAttribute('src')).toMatch(/^blob:/);
    expect(document.querySelector('svg script, script')).toBeNull();
    expect((window as { ran?: boolean }).ran).toBeUndefined();
    expect(await urls.made[1]?.text()).toBe(svg);

    for (const call of raw.calls) {
      expect(call.url).not.toMatch(/token|authorization|bearer/i);
      expect(call.query.get('download')).toBeNull();
    }

    // Each object URL is let go of with its preview.
    act(() => {
      openFile(FOLDER, 'logo.png');
    });
    const tabs = editorState().groups[0]?.tabs ?? [];
    expect(tabs.map((tab) => tab.kind)).toEqual(['preview', 'preview']);
  });

  it('opens an image from the tree as its picture, and the toggle of the tab shows its bytes', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, {
      'logo.png': {
        content: '',
        unreadable: new (await import('@/shared/api/errors')).AppError(
          'FILE_NOT_TEXT',
          'files.error.notText',
          'trace',
          { reason: 'binary' },
        ),
      },
    });
    fakeRaw(FOLDER, { 'logo.png': 'PNG' });
    fakeObjectUrls();
    renderEditor();
    open('logo.png');

    await previewOf('logo.png');
    const toggle = within(group()).getByRole('button', { name: t('editor.strip.togglePreview') });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(await screen.findByText(t('editor.paged.hexTitle', { path: 'logo.png' }))).toBeVisible();
    expect(editorState().groups[0]?.tabs.map((tab) => tab.id)).toEqual(['file:logo.png']);

    await user.click(
      within(group()).getByRole('button', { name: t('editor.strip.togglePreview') }),
    );
    expect(await previewOf('logo.png')).toBeVisible();
  });

  it('draws a PDF with the pdf.js of the build, a page at a time (S-311)', async () => {
    const user = userEvent.setup();
    const pdf = aPdfEngine(3);
    setPdfLoader(() => Promise.resolve(pdf.engine));
    fakeDisk(FOLDER, {});
    fakeRaw(FOLDER, { 'doc.pdf': '%PDF-1.7' });
    renderEditor();
    open('doc.pdf');

    const preview = await previewOf('doc.pdf');
    expect(
      await within(preview).findByText(t('editor.preview.pdfPage', { page: 1, pages: 3 })),
    ).toBeVisible();
    expect(
      within(preview).getByRole('img', {
        name: t('editor.preview.pdfCanvas', { name: 'doc.pdf', page: 1 }),
      }),
    ).toBeVisible();
    expect(
      within(preview).getByRole('button', { name: t('editor.preview.pdfPrevious') }),
    ).toBeDisabled();

    await user.click(within(preview).getByRole('button', { name: t('editor.preview.pdfNext') }));
    await user.click(within(preview).getByRole('button', { name: t('editor.preview.pdfNext') }));
    expect(await within(preview).findByRole('alert')).toHaveTextContent(
      t('editor.preview.pdfPageFailed', { page: 3 }),
    );
    expect(
      within(preview).getByRole('button', { name: t('editor.preview.pdfNext') }),
    ).toBeDisabled();
    await user.click(
      within(preview).getByRole('button', { name: t('editor.preview.pdfPrevious') }),
    );
    expect(pdf.drawn).toEqual([1, 2, 3, 2]);
    expect(within(preview).queryByRole('alert')).toBeNull();

    // Another file in the place of the preview: the document is let go of.
    act(() => {
      openFile(FOLDER, 'other.pdf');
    });
    await waitFor(() => {
      expect(pdf.destroyed()).toBe(1);
    });
  });

  it('gives up the drawing of a page left behind, so the next one has the canvas', async () => {
    const user = userEvent.setup();
    const pdf = aStrictPdfEngine(3);
    setPdfLoader(() => Promise.resolve(pdf.engine));
    fakeDisk(FOLDER, {});
    fakeRaw(FOLDER, { 'doc.pdf': '%PDF-1.7' });
    renderEditor();
    open('doc.pdf');

    const preview = await previewOf('doc.pdf');
    const next = await within(preview).findByRole('button', {
      name: t('editor.preview.pdfNext'),
    });
    // Page 1 still being drawn when page 2 is asked for, and page 2 when page 3 is.
    await user.click(next);
    await user.click(next);
    expect(
      await within(preview).findByText(t('editor.preview.pdfPage', { page: 3, pages: 3 })),
    ).toBeVisible();
    act(() => {
      pdf.finish();
    });

    expect(pdf.givenUp()).toEqual([1, 2]);
    expect(within(preview).queryByRole('alert')).toBeNull();
  });

  it('says so when a PDF cannot be read, or the viewer did not load — and tries again', async () => {
    const user = userEvent.setup();
    const broken = aPdfEngine(1, new Error('Invalid PDF structure'));
    let loads = 0;
    setPdfLoader(() => {
      loads += 1;
      return loads === 1 ? Promise.reject(new Error('chunk')) : Promise.resolve(broken.engine);
    });
    fakeDisk(FOLDER, {});
    fakeRaw(FOLDER, { 'doc.pdf': 'not a pdf' });
    renderEditor();
    open('doc.pdf');

    expect(await screen.findByText(t('editor.preview.pdfLoadFailed'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(
      await screen.findByText(t('editor.preview.pdfBroken', { name: 'doc.pdf' })),
    ).toBeVisible();
  });

  it('follows the buffer beside the editor, as it is typed and before it is saved (S-312)', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, { 'README.md': '# One' });
    renderEditor();
    open('README.md');
    const area = await editorOf('README.md');

    area.focus();
    await user.keyboard('{Control>}k{/Control}v');
    const preview = await previewOf('README.md');
    expect(await within(preview).findByRole('heading', { name: 'One' })).toBeVisible();
    expect(editorState().groups).toHaveLength(2);

    typeInto(area, '# Two\n\nunsaved');
    expect(await within(preview).findByRole('heading', { name: 'Two' })).toBeVisible();
    expect(within(preview).getByText('unsaved')).toBeVisible();
    expect(disk.saves()).toHaveLength(0);
    expect(
      within(stripOf(1)).getByRole('button', { name: /README\.md, Unsaved changes/ }),
    ).toBeVisible();
  });

  it('shows a broken image as a translated placeholder, never a broken icon (S-313)', async () => {
    fakeDisk(FOLDER, {});
    fakeRaw(FOLDER, { 'broken.png': 'not an image' });
    fakeObjectUrls();
    renderEditor();
    open('broken.png');

    const image = await within(await previewOf('broken.png')).findByRole('img', {
      name: 'broken.png',
    });
    fireEvent.error(image);
    expect(
      await screen.findByText(t('editor.preview.broken', { name: 'broken.png' })),
    ).toBeVisible();
    expect(screen.queryByRole('img', { name: 'broken.png' })).toBeNull();
  });

  it('says why an image did not arrive, and reads it again', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, {});
    const raw = fakeRaw(FOLDER, {});
    fakeObjectUrls();
    renderEditor();
    open('gone.png');

    expect(await screen.findByText(t('files.error.notFound', { path: 'gone.png' }))).toBeVisible();
    raw.files.set('gone.png', 'PNG');
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await screen.findByRole('img', { name: 'gone.png' })).toBeVisible();
  });

  it('says the download ceiling of a picture past it, in the words of a preview', async () => {
    fakeDisk(FOLDER, {});
    const raw = fakeRaw(FOLDER, { 'huge.png': 'PNG' });
    raw.refuseNext(
      '/files/raw',
      refused('FILE_TOO_LARGE', 'files.error.tooLarge', { limit: 200_000_000, measure: 'bytes' }),
    );
    fakeObjectUrls();
    renderEditor();
    open('huge.png');

    expect(
      await screen.findByText(t('editor.preview.tooLarge', { path: 'huge.png', limit: '200 MB' })),
    ).toBeVisible();
  });

  it('shows an HTML file as its source, saying why it is not a page', async () => {
    fakeDisk(FOLDER, { 'index.html': '<h1>Page</h1><script>window.ran = true</script>' });
    renderEditor();
    act(() => {
      openPreview(FOLDER, 'index.html');
    });

    const preview = await previewOf('index.html');
    expect(await within(preview).findByText(t('editor.preview.htmlSource'))).toBeVisible();
    expect(
      within(preview).getByLabelText(t('editor.preview.sourceLabel', { name: 'index.html' })),
    ).toHaveTextContent('<h1>Page</h1>');
    expect(preview.querySelector('h1, script')).toBeNull();
  });

  it('says why a text preview could not be read, and reads it again', async () => {
    const user = userEvent.setup();
    const disk = fakeDisk(FOLDER, {});
    renderEditor();
    act(() => {
      openPreview(FOLDER, 'notes.md');
    });

    expect(await screen.findByText(t('files.error.notFound', { path: 'notes.md' }))).toBeVisible();
    disk.files.set('notes.md', { content: '# Notes' });
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeVisible();
  });
});

describe('previews in their edges — plan 07, B-50', () => {
  it('reads the file of a preview a reload gave back, which nothing had opened', async () => {
    fakeDisk(FOLDER, { 'a.md': '# Restored' });
    act(() => {
      editorStoreOf(FOLDER).setState(openIn(emptyLayout(), aPreviewTab('a.md', false), false));
    });
    renderEditor();

    expect(await screen.findByRole('heading', { name: 'Restored' })).toBeVisible();
  });

  it('shows an image a text names out of the folder as the placeholder, without asking for it', async () => {
    fakeDisk(FOLDER, { 'a.md': '![secret](../../etc/x.png)' });
    const raw = fakeRaw(FOLDER, {});
    renderEditor();
    act(() => {
      openPreview(FOLDER, 'a.md');
    });

    expect(await screen.findByText(t('editor.preview.broken', { name: 'secret' }))).toBeVisible();
    expect(raw.calls).toHaveLength(0);
  });

  it('lets go of what arrives after its preview went — the image read, the PDF opened', async () => {
    const pdf = aPdfEngine(1);
    setPdfLoader(() => Promise.resolve(pdf.engine));
    fakeDisk(FOLDER, { 'b.ts': 'b' });
    const raw = fakeRaw(FOLDER, { 'a.png': 'PNG', 'c.pdf': '%PDF' });
    const urls = fakeObjectUrls();
    const release = raw.hold(() => true);
    renderEditor();

    open('a.png');
    await previewOf('a.png');
    open('c.pdf');
    await previewOf('c.pdf');
    open('b.ts');
    await editorOf('b.ts');
    act(() => {
      release();
    });

    await waitFor(() => {
      expect(pdf.destroyed()).toBe(1);
    });
    expect(urls.made).toHaveLength(0);
  });
});

describe('the commands of the previews — plan 07, B-53', () => {
  it('lists "Open preview" and "Open preview to the side" with their keys, and the toggle has its tooltip (S-324)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'README.md': '# Hi', 'a.ts': 'a' });
    renderEditor();
    open('README.md');
    await editorOf('README.md');
    act(() => {
      document.body.focus();
    });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.openPreview'));
    const toSide = await screen.findByRole('option', {
      name: new RegExp(t('command.editor.openPreviewToSide')),
    });
    expect(toSide).toHaveTextContent('Ctrl+K V');
    const here = screen.getByRole('option', {
      name: new RegExp(`${t('command.editor.openPreview')}Ctrl`),
    });
    expect(here).toHaveTextContent('Ctrl+Shift+V');
    await user.click(here);
    expect(await previewOf('README.md')).toBeVisible();

    const toggle = within(group()).getByRole('button', { name: t('editor.strip.togglePreview') });
    await user.hover(toggle);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(t('editor.strip.togglePreview'));

    // The toggle from the palette, back to the editor; nothing to toggle for a file with no preview.
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('command.editor.togglePreview'));
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('command.editor.togglePreview')) }),
    );
    expect(await editorOf('README.md')).toBeVisible();

    open('a.ts');
    await editorOf('a.ts');
    expect(
      within(group()).queryByRole('button', { name: t('editor.strip.togglePreview') }),
    ).toBeNull();
  });

  it('opens the preview with Ctrl+Shift+V, and to the side from the strip', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'README.md': '# Hi' });
    renderEditor();
    open('README.md');
    await editorOf('README.md');
    act(() => {
      document.body.focus();
    });

    await user.keyboard('{Control>}{Shift>}v{/Shift}{/Control}');
    expect(await previewOf('README.md')).toBeVisible();
    await user.click(within(group()).getByRole('button', { name: t('editor.strip.openToSide') }));
    await waitFor(() => {
      expect(editorState().groups.map((group) => group.tabs.map((tab) => tab.id))).toEqual([
        ['file:README.md', 'preview:README.md'],
        ['preview:README.md'],
      ]);
    });
  });

  it('has no accessibility violation in a markdown and an image preview (S-324)', async () => {
    fakeDisk(FOLDER, { 'README.md': '# Title\n\n[web](https://example.com)\n\n![logo](logo.png)' });
    fakeRaw(FOLDER, { 'logo.png': 'PNG' });
    fakeObjectUrls();
    const { container } = renderEditor();
    act(() => {
      openPreview(FOLDER, 'README.md');
    });
    await within(await previewOf('README.md')).findByRole('img', { name: 'logo' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
