import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { FileLimits } from '@/features/explorer/types/transfer';
import { editorFake, resetEditorFake } from '../../../support/editor-fake';
import { APP, ExplorerHarness, fakeWatches, row, theTree } from '../../../support/explorer';
import { FakeFolder, etagOf, filesRefusal } from '../../../support/files-api';
import type { FakeEntry } from '../../../support/files-api';
import { render, translator } from '../../../support/render';
import { LIMITS, catchSavedLinks, fakeTransfer } from '../../../support/transfer-api';
import type { FakeTransferOptions } from '../../../support/transfer-api';
import type { Locale } from '@/shared/i18n';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetEditorFake();
});

type User = ReturnType<typeof userEvent.setup>;

/** The Explorer over a fake folder, with the transfer routes of the fake server. */
function renderTransfer(
  tree: Readonly<Record<string, FakeEntry | string>>,
  options: FakeTransferOptions & { readonly locale?: Locale } = {},
) {
  const disk = new FakeFolder(APP, tree).install();
  const transfer = fakeTransfer(disk, options);
  fakeWatches();
  const rendered = render(<ExplorerHarness folder={APP} />, options.locale);
  return { ...rendered, disk, transfer };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A menu item by its label — followed by its key, or nothing; never by a longer label. */
function item(key: string): RegExp {
  return new RegExp(`^${escape(t(key))}(?![a-z ])`);
}

async function pick(user: User, name: string, actionKey: string): Promise<void> {
  fireEvent.contextMenu(await row(name));
  const menu = await screen.findByRole('menu', { name: t('explorer.menu.label') });
  await user.click(within(menu).getByRole('menuitem', { name: item(actionKey) }));
}

// The entries API of a drop from the desktop, as the browsers share it.
function aFile(fullPath: string, content: string) {
  return {
    isFile: true,
    isDirectory: false,
    fullPath,
    name: fullPath.slice(fullPath.lastIndexOf('/') + 1),
    file: (resolve: (file: File) => void) => {
      resolve(new File([content], fullPath.slice(fullPath.lastIndexOf('/') + 1)));
    },
  };
}

function aDirectory(fullPath: string, children: readonly unknown[]) {
  return {
    isFile: false,
    isDirectory: true,
    fullPath,
    name: fullPath.slice(fullPath.lastIndexOf('/') + 1),
    createReader: () => {
      let given = false;
      return {
        readEntries: (resolve: (entries: readonly unknown[]) => void) => {
          resolve(given ? [] : children);
          given = true;
        },
      };
    },
  };
}

/** A drop from the desktop: `Files`, with each entry — or, without the entries API, plain files. */
function desktopDrop(entries: readonly unknown[], files: readonly File[] = []): DataTransfer {
  return {
    types: ['Files'],
    items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry: () => entry })),
    files,
    getData: () => '',
    dropEffect: 'none',
    effectAllowed: 'all',
  } as unknown as DataTransfer;
}

/** The browser's dialog answered: the input holds the files, and says it changed. */
function choose(input: HTMLInputElement, files: readonly File[]): void {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

/** What the Explorer said last, to a screen reader. */
function said(key: string, params: Record<string, unknown> = {}): Promise<HTMLElement> {
  return screen.findByText(t(key, params));
}

describe('upload — plan 07, B-52', () => {
  it('uploads files and a folder dragged from the desktop onto a folder, with each file’s progress (S-318)', async () => {
    const { disk, transfer } = renderTransfer({ 'src/a.ts': 'a' });
    const held = transfer.holdUpload();
    const target = await row('src');

    const drop = desktopDrop([
      aFile('/notes.txt', 'notes'),
      aDirectory('/assets', [
        aFile('/assets/logo.svg', '<svg/>'),
        aDirectory('/assets/img', [aFile('/assets/img/x.png', 'png')]),
      ]),
    ]);
    expect(fireEvent.dragOver(target, { dataTransfer: drop })).toBe(false);
    expect(drop.dropEffect).toBe('copy');
    fireEvent.drop(target, { dataTransfer: drop });

    const progress = await screen.findByRole('region', {
      name: t('explorer.upload.progressLabel'),
    });
    expect(within(progress).getByText(t('explorer.upload.sending', { count: 3 }))).toBeVisible();
    act(() => {
      held()?.progress(5, 14);
    });
    expect(
      within(progress).getByRole('progressbar', {
        name: t('explorer.upload.fileProgress', { path: 'notes.txt', percent: 100 }),
      }),
    ).toBeVisible();
    expect(
      within(progress).getByRole('progressbar', {
        name: t('explorer.upload.fileProgress', { path: 'assets/logo.svg', percent: 0 }),
      }),
    ).toBeVisible();

    act(() => {
      held()?.release();
    });
    expect(await said('explorer.done.uploaded', { count: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('explorer.upload.progressLabel') })).toBeNull();
    // A progress the browser reports late, once the upload is over, shows nothing again.
    act(() => {
      held()?.progress(14, 14);
    });
    expect(screen.queryByRole('region', { name: t('explorer.upload.progressLabel') })).toBeNull();
    expect(transfer.preflights[0]).toMatchObject({ folder: APP, directory: 'src' });
    expect(transfer.uploads[0]?.manifest).toEqual([
      { path: 'notes.txt', size: 5, onConflict: 'fail' },
      { path: 'assets/logo.svg', size: 6, onConflict: 'fail' },
      { path: 'assets/img/x.png', size: 3, onConflict: 'fail' },
    ]);
    expect(disk.entries.get('src/assets/img/x.png')?.content).toBe('png');
  });

  it('asks about the files already there BEFORE sending — Replace, Keep both, Skip each (S-319)', async () => {
    const user = userEvent.setup();
    const { disk, transfer, container } = renderTransfer({
      'docs/a.md': 'old a',
      'docs/b.md': 'old b',
      'docs/c.md': 'old c',
      'docs/sub/x': 'dir',
    });
    fireEvent.drop(await row('docs'), {
      dataTransfer: desktopDrop(
        [],
        [
          new File(['new a'], 'a.md'),
          new File(['new b'], 'b.md'),
          new File(['new c'], 'c.md'),
          new File(['file'], 'sub'),
          new File(['fresh'], 'd.md'),
        ],
      ),
    });

    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.upload.conflictsTitle', { count: 4 }),
    });
    expect(transfer.uploads).toHaveLength(0);
    expect(within(dialog).getAllByRole('group')).toHaveLength(4);
    // A folder in the way of a file cannot be replaced by it.
    const sub = within(dialog).getByRole('group', { name: 'sub' });
    expect(within(sub).queryByRole('radio', { name: t('explorer.upload.replace') })).toBeNull();
    expect(
      within(within(dialog).getByRole('group', { name: 'a.md' })).getByRole('radio', {
        name: t('explorer.upload.skip'),
      }),
    ).toBeChecked();
    expect(await axe(container.ownerDocument.body)).toHaveNoViolations();

    await user.click(
      within(within(dialog).getByRole('group', { name: 'a.md' })).getByRole('radio', {
        name: t('explorer.upload.replace'),
      }),
    );
    await user.click(
      within(within(dialog).getByRole('group', { name: 'b.md' })).getByRole('radio', {
        name: t('explorer.upload.keepBoth'),
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: t('explorer.upload.send') }));

    expect(await said('explorer.done.uploaded', { count: 3 })).toBeInTheDocument();
    expect(transfer.uploads[0]?.manifest).toEqual([
      { path: 'a.md', size: 5, onConflict: 'replace', ifMatch: etagOf('old a') },
      { path: 'b.md', size: 5, onConflict: 'keepBoth' },
      { path: 'd.md', size: 5, onConflict: 'fail' },
    ]);
    expect(transfer.uploads[0]?.names).toEqual(['a.md', 'b.md', 'd.md']);
    expect(disk.entries.get('docs/a.md')?.content).toBe('new a');
    expect(disk.entries.get('docs/b copy.md')?.content).toBe('new b');
    expect(disk.entries.get('docs/c.md')?.content).toBe('old c');
  });

  it('says it when the version a file replaced was not kept in the local history (07 · F8)', async () => {
    const user = userEvent.setup();
    renderTransfer({ 'a.md': 'old' }, { history: { kept: false, reason: 'unavailable' } });
    const tree = await theTree();
    fireEvent.drop(tree.parentElement as HTMLElement, {
      dataTransfer: desktopDrop([], [new File(['new'], 'a.md'), new File(['b'], 'b.md')]),
    });

    const ask = await screen.findByRole('dialog');
    await user.click(within(ask).getByRole('radio', { name: t('explorer.upload.replace') }));
    await user.click(within(ask).getByRole('button', { name: t('explorer.upload.send') }));

    const dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.uploadNotKept') });
    expect(within(dialog).getByText(t('explorer.outcome.notKeptUnavailable'))).toBeVisible();
    expect(within(dialog).getByText(t('explorer.outcome.done'))).toBeVisible();
  });

  it('cancels the question, and sends nothing when every file was skipped', async () => {
    const user = userEvent.setup();
    const { transfer } = renderTransfer({ 'a.md': 'a' });
    const tree = await theTree();
    fireEvent.drop(tree.parentElement as HTMLElement, {
      dataTransfer: desktopDrop([], [new File(['x'], 'a.md')]),
    });

    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('explorer.upload.cancel') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.drop(tree.parentElement as HTMLElement, {
      dataTransfer: desktopDrop([], [new File(['x'], 'a.md')]),
    });
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('explorer.upload.send') }));
    expect(await said('explorer.done.uploadSkipped')).toBeInTheDocument();
    expect(transfer.uploads).toHaveLength(0);
  });

  it('cancels an upload on its way — nothing is left half-written (S-322)', async () => {
    const user = userEvent.setup();
    const { disk, transfer } = renderTransfer({ 'src/a.ts': 'a' });
    transfer.holdUpload();
    fireEvent.drop(await row('src'), { dataTransfer: desktopDrop([aFile('/big.bin', 'bytes')]) });

    const progress = await screen.findByRole('region', {
      name: t('explorer.upload.progressLabel'),
    });
    await user.click(
      within(progress).getByRole('button', { name: t('explorer.upload.cancelSending') }),
    );

    expect(await said('explorer.done.uploadCancelled')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: t('explorer.upload.progressLabel') })).toBeNull();
    expect(disk.entries.has('src/big.bin')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses before anything moves what passes a ceiling, saying it', async () => {
    const limits: FileLimits = {
      ...LIMITS,
      uploadMaxBytes: 4,
      uploadMaxEntries: 2,
      uploadMaxTotalBytes: 6,
    };
    const { transfer } = renderTransfer({ 'src/a.ts': 'a' }, { limits });
    const user = userEvent.setup();
    // The ceilings are read once, when the Explorer opens — before its tree is on screen.
    await screen.findByRole('tree');

    const cases = [
      {
        files: [new File(['12345'], 'big.bin')],
        key: 'explorer.transfer.fileTooLarge',
        path: 'big.bin',
        limit: '4 byte',
      },
      {
        files: [new File(['1'], 'a'), new File(['2'], 'b'), new File(['3'], 'c')],
        key: 'explorer.transfer.tooManyFiles',
        path: 'a',
        limit: '2',
      },
      {
        files: [new File(['1234'], 'a'), new File(['1234'], 'b')],
        key: 'explorer.transfer.uploadTooLarge',
        path: 'a',
        limit: '6 byte',
      },
    ];

    for (const each of cases) {
      fireEvent.drop(await row('src'), { dataTransfer: desktopDrop([], each.files) });
      const dialog = await screen.findByRole('dialog', {
        name: t('explorer.outcome.uploadFailed'),
      });
      expect(within(dialog).getByText(each.path)).toBeVisible();
      expect(within(dialog).getByText(new RegExp(escape(each.limit)))).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: t('explorer.outcome.close') }));
    }

    expect(transfer.preflights).toHaveLength(0);
    expect(transfer.uploads).toHaveLength(0);
  });

  it('lists what went and what did not when some files failed (207), on the outcome screen of B-27', async () => {
    const { disk, transfer } = renderTransfer({ 'src/a.ts': 'a' });
    const held = transfer.holdUpload();
    fireEvent.drop(await row('src'), {
      dataTransfer: desktopDrop([aFile('/one.txt', '1'), aFile('/two.txt', '2')]),
    });
    await screen.findByRole('region', { name: t('explorer.upload.progressLabel') });
    // Somebody made `two.txt` while the upload was on its way.
    disk.put('src/two.txt', 'theirs');
    act(() => {
      held()?.release();
    });

    const dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.uploadFailed') });
    expect(within(dialog).getByText('src/one.txt')).toBeVisible();
    expect(within(dialog).getByText(t('explorer.outcome.done'))).toBeVisible();
    expect(
      within(dialog).getByText(t('files.error.exists', { path: 'src/two.txt' })),
    ).toBeVisible();
  });

  it('asks the second step for a sensitive path, and sends again confirmed (07 · D-15)', async () => {
    const user = userEvent.setup();
    const { disk, transfer } = renderTransfer({ '.claude/x': 'x' });
    fireEvent.drop(await row('.claude'), {
      dataTransfer: desktopDrop([aFile('/settings.json', '{}')]),
    });

    const dialog = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    expect(within(dialog).getByText('.claude/settings.json')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('explorer.sensitive.confirm') }));

    expect(await said('explorer.done.uploaded', { count: 1 })).toBeInTheDocument();
    expect(transfer.uploads.map((call) => call.confirmSensitive)).toEqual([false, true]);
    expect(disk.entries.get('.claude/settings.json')?.content).toBe('{}');
  });

  it('says why an upload was refused whole, and why a preflight was', async () => {
    const user = userEvent.setup();
    const { transfer, disk } = renderTransfer({ 'src/a.ts': 'a' });
    transfer.refuseNextUpload(
      filesRefusal('FILE_TOO_LARGE', 'files.error.tooLarge', {
        size: 900,
        limit: 500,
        measure: 'bytes',
      }),
    );
    fireEvent.drop(await row('src'), { dataTransfer: desktopDrop([aFile('/x.txt', 'x')]) });

    let dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.uploadFailed') });
    expect(
      within(dialog).getByText(
        t('explorer.transfer.uploadTooLarge', { size: '900 byte', limit: '500 byte' }),
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('explorer.outcome.close') }));

    disk.refuseNext(
      (call) => call.route === '/files/tree',
      filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path: 'src' }),
    );
    vi.mocked((await import('@/shared/api/api')).api.post).mockRejectedValueOnce(
      filesRefusal('INVALID_INPUT', 'files.error.invalidPath'),
    );
    fireEvent.drop(await row('src'), { dataTransfer: desktopDrop([aFile('/y.txt', 'y')]) });
    dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.uploadFailed') });
    expect(within(dialog).getByText(t('files.error.invalidPath'))).toBeVisible();
  });

  it('says it when a drop cannot be read', async () => {
    renderTransfer({ 'src/a.ts': 'a' });
    const broken = {
      isFile: true,
      isDirectory: false,
      fullPath: '/x',
      file: (_resolve: unknown, reject: (error: Error) => void) => {
        reject(new Error('gone'));
      },
    };
    fireEvent.drop(await row('src'), { dataTransfer: desktopDrop([broken]) });

    const dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.uploadFailed') });
    expect(within(dialog).getByText(t('common.error.unexpected'))).toBeVisible();
  });

  it('uploads files and a folder from the keyboard, through the browser’s dialogs (S-360)', async () => {
    const user = userEvent.setup();
    const clicked: HTMLInputElement[] = [];
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function click(
      this: HTMLInputElement,
    ) {
      clicked.push(this);
    });
    const { disk } = renderTransfer({ 'src/a.ts': 'a' });
    const src = await row('src');
    act(() => {
      src.focus();
    });

    await user.keyboard('{Alt>}u{/Alt}');
    expect(clicked[0]?.multiple).toBe(true);
    choose(clicked[0] as HTMLInputElement, [new File(['one'], 'one.txt')]);
    expect(await said('explorer.done.uploaded', { count: 1 })).toBeInTheDocument();
    expect(disk.entries.get('src/one.txt')?.content).toBe('one');

    await user.keyboard('{Shift>}{Alt>}u{/Alt}{/Shift}');
    const folder = clicked[1] as HTMLInputElement;
    expect(folder.hasAttribute('webkitdirectory')).toBe(true);
    const inFolder = new File(['two'], 'two.txt');
    Object.defineProperty(inFolder, 'webkitRelativePath', { value: 'pack/two.txt' });
    choose(folder, [inFolder]);
    await waitFor(() => {
      expect(disk.entries.get('src/pack/two.txt')?.content).toBe('two');
    });
    expect(folder.value).toBe('');
  });
});

describe('download — plan 07, B-52', () => {
  it('downloads a file by a link to a blob — never a URL with a token (S-320)', async () => {
    const user = userEvent.setup();
    const { saved } = catchSavedLinks();
    const { transfer } = renderTransfer({ 'src/a.ts': 'export const a = 1;' });
    await user.click(await row('src'));

    await pick(user, 'a.ts', 'explorer.action.download');
    expect(await said('explorer.done.downloaded', { name: 'a.ts' })).toBeInTheDocument();
    expect(transfer.downloads[0]?.route).toBe('/files/raw');
    expect(transfer.downloads[0]?.query.get('download')).toBe('true');
    expect(transfer.downloads[0]?.url).not.toMatch(/token|bearer/i);
    expect(saved[0]?.name).toBe('a.ts');
    expect(saved[0]?.href).toMatch(/^blob:/);
    expect(await saved[0]?.blob.text()).toBe('export const a = 1;');
  });

  it('downloads a folder as a zip, and the selection of two files and a folder as one zip (S-320, S-359)', async () => {
    const user = userEvent.setup();
    const { saved } = catchSavedLinks();
    const { transfer } = renderTransfer({ 'src/a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });

    await pick(user, 'src', 'explorer.action.download');
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(transfer.downloads[0]?.route).toBe('/files/archive');
    expect(transfer.downloads[0]?.query.getAll('path')).toEqual(['src']);
    expect(saved[0]?.name).toBe('served.zip');

    await user.click(await row('b.ts'));
    await user.keyboard('{Control>}');
    await user.click(await row('c.ts'));
    await user.click(await row('src'));
    await user.keyboard('{/Control}');
    await pick(user, 'c.ts', 'explorer.action.download');
    await waitFor(() => {
      expect(saved).toHaveLength(2);
    });
    expect(transfer.downloads[1]?.route).toBe('/files/archive');
    expect([...(transfer.downloads[1]?.query.getAll('path') ?? [])].sort()).toEqual([
      'b.ts',
      'c.ts',
      'src',
    ]);
    expect(transfer.downloads[1]?.url).not.toMatch(/token|bearer/i);
  });

  it('refuses a file past the download ceiling before it starts, saying the ceiling (S-321)', async () => {
    const user = userEvent.setup();
    const { transfer } = renderTransfer(
      { 'big.log': '1234567890' },
      { limits: { ...LIMITS, downloadMaxBytes: 4 } },
    );
    await pick(user, 'big.log', 'explorer.action.download');
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.outcome.downloadFailed'),
    });
    expect(
      within(dialog).getByText(
        t('explorer.transfer.downloadTooLarge', { path: 'big.log', limit: '4 byte' }),
      ),
    ).toBeVisible();
    expect(transfer.downloads).toHaveLength(0);
  });

  it('says the ceiling the server refused a zip by — entries or bytes (S-321)', async () => {
    const user = userEvent.setup();
    catchSavedLinks();
    const { transfer } = renderTransfer({ 'src/a.ts': 'a' });
    transfer.refuseNextDownload(
      filesRefusal('FILE_TOO_LARGE', 'files.error.tooLarge', {
        measure: 'entries',
        limit: 10_000,
        size: 12_000,
      }),
    );
    await pick(user, 'src', 'explorer.action.download');
    let dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.downloadFailed') });
    expect(
      within(dialog).getByText(
        t('explorer.transfer.archiveTooManyEntries', { path: 'src.zip', limit: '10,000' }),
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('explorer.outcome.close') }));

    transfer.refuseNextDownload(
      filesRefusal('FILE_TOO_LARGE', 'files.error.tooLarge', {
        measure: 'bytes',
        limit: 200_000_000,
      }),
    );
    await pick(user, 'src', 'explorer.action.download');
    dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.downloadFailed') });
    expect(within(dialog).getByText(/200 MB/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: t('explorer.outcome.close') }));

    transfer.refuseNextDownload(filesRefusal('TRAIL_UNAVAILABLE', 'files.error.trailUnavailable'));
    await pick(user, 'src', 'explorer.action.download');
    dialog = await screen.findByRole('dialog', { name: t('explorer.outcome.downloadFailed') });
    expect(within(dialog).getByText(t('files.error.trailUnavailable'))).toBeVisible();
  });

  it('saves where the browser’s save dialog says, where there is one — and nothing when it is closed', async () => {
    const user = userEvent.setup();
    const written: Blob[] = [];
    const picker = vi
      .fn()
      .mockResolvedValueOnce({
        createWritable: () =>
          Promise.resolve({
            write: (blob: Blob) => {
              written.push(blob);
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
      })
      .mockRejectedValueOnce(new DOMException('closed', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('denied', 'SecurityError'));
    vi.stubGlobal('showSaveFilePicker', picker);
    const { saved } = catchSavedLinks();
    const { transfer } = renderTransfer({ 'a.ts': 'text' });

    await pick(user, 'a.ts', 'explorer.action.download');
    await waitFor(() => {
      expect(written).toHaveLength(1);
    });
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'a.ts' });
    expect(await written[0]?.text()).toBe('text');

    await pick(user, 'a.ts', 'explorer.action.download');
    await waitFor(() => {
      expect(picker).toHaveBeenCalledTimes(2);
    });
    expect(transfer.downloads).toHaveLength(1);

    // A dialog that failed for another reason falls back to the link.
    await pick(user, 'a.ts', 'explorer.action.download');
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
  });

  it('downloads from the keyboard with the focus in the tree (S-360)', async () => {
    const user = userEvent.setup();
    const { saved } = catchSavedLinks();
    renderTransfer({ 'a.ts': 'a' });
    const file = await row('a.ts');
    act(() => {
      file.focus();
    });

    await user.keyboard('{Shift>}{Alt>}d{/Alt}{/Shift}');
    await waitFor(() => {
      expect(saved.map((each) => each.name)).toEqual(['a.ts']);
    });
  });
});

describe('previews from the tree, and the help — plan 07, B-50 and B-53', () => {
  it('opens the preview of a file that has one, from its menu', async () => {
    const user = userEvent.setup();
    renderTransfer({ 'README.md': '# Hi', 'a.ts': 'a' });

    await pick(user, 'README.md', 'explorer.action.openPreview');
    expect(editorFake.openPreview).toHaveBeenCalledWith(APP, 'README.md');

    fireEvent.contextMenu(await row('a.ts'));
    const menu = await screen.findByRole('menu', { name: t('explorer.menu.label') });
    expect(
      within(menu).getByRole('menuitem', { name: item('explorer.action.openPreview') }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('has the upload buttons in the toolbar, with their tooltips (S-324)', async () => {
    const user = userEvent.setup();
    renderTransfer({ 'a.ts': 'a' });
    const toolbar = await screen.findByRole('toolbar', { name: t('explorer.toolbar.label') });

    const upload = within(toolbar).getByRole('button', { name: t('explorer.action.uploadFiles') });
    expect(
      within(toolbar).getByRole('button', { name: t('explorer.action.uploadFolder') }),
    ).toBeVisible();
    await user.hover(upload);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(t('explorer.action.uploadFiles'));
  });

  it.each(['en', 'pt-BR'] as const)(
    'says what is uploaded and downloaded, the ceilings of this machine and what happens above them, in %s (S-323)',
    async (locale) => {
      const user = userEvent.setup();
      const tr = translator(locale);
      renderTransfer({ 'a.ts': 'a' }, { locale });
      const toolbar = await screen.findByRole('toolbar', { name: tr('explorer.toolbar.label') });

      await user.click(within(toolbar).getByRole('button', { name: tr('explorer.action.help') }));
      const help = await screen.findByRole('dialog');
      expect(
        within(help).getByRole('heading', { name: tr('explorer.help.transferHeading') }),
      ).toBeVisible();
      expect(within(help).getByText(tr('explorer.help.transfer'))).toBeVisible();
      expect(within(help).getByText(tr('explorer.help.transferAbove'))).toBeVisible();
      const limits = within(help).getByText(/100 MB/);
      expect(limits).toHaveTextContent(/200 MB/);
      expect(limits).toHaveTextContent(/500 MB/);
      expect(within(help).getByText('Alt+U')).toBeVisible();
      expect(within(help).getByText('Alt+Shift+D')).toBeVisible();
    },
  );

  it('says the ceilings could not be read, rather than numbers it does not have', async () => {
    const user = userEvent.setup();
    renderTransfer(
      { 'a.ts': 'a' },
      { limits: filesRefusal('INTERNAL_ERROR', 'common.error.unexpected') },
    );
    const toolbar = await screen.findByRole('toolbar', { name: t('explorer.toolbar.label') });

    await user.click(within(toolbar).getByRole('button', { name: t('explorer.action.help') }));
    expect(await screen.findByText(t('explorer.help.transferUnknown'))).toBeVisible();
  });
});
