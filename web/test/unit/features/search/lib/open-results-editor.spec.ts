import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFile = vi.fn();
const openFile = vi.fn();

vi.mock('@/features/editor', () => ({ createFile, openFile }));

describe('openResultsEditor — plan 11, B-17', () => {
  beforeEach(() => {
    createFile.mockReset();
    openFile.mockReset();
    createFile.mockResolvedValue({ path: 'search-results.code-search', etag: 'x' });
  });

  it('writes the on-screen results as a real .code-search file, then opens it', async () => {
    const { openResultsEditor } = await import('@/features/search/lib/open-results-editor');

    await openResultsEditor(
      'main',
      {
        query: 'TODO',
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        include: '',
        exclude: '',
        useIgnoreFiles: true,
      },
      [],
    );

    expect(createFile).toHaveBeenCalledTimes(1);
    const write = createFile.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(write['folder']).toBe('main');
    expect(write['path']).toMatch(/\.code-search$/);
    expect(write['content']).toContain('# Query: TODO');

    expect(openFile).toHaveBeenCalledWith('main', write['path']);
  });

  it('never writes to any path already open by a search result, only a fresh one', async () => {
    const { openResultsEditor } = await import('@/features/search/lib/open-results-editor');

    await openResultsEditor(
      'main',
      {
        query: 'x',
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        include: '',
        exclude: '',
        useIgnoreFiles: true,
      },
      [],
    );
    await openResultsEditor(
      'main',
      {
        query: 'x',
        isRegex: false,
        caseSensitive: false,
        wholeWord: false,
        include: '',
        exclude: '',
        useIgnoreFiles: true,
      },
      [],
    );

    const [firstPath, secondPath] = createFile.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>)['path'],
    );
    expect(firstPath).not.toBe(secondPath);
  });

  it('propagates a write failure, instead of opening a tab for it', async () => {
    createFile.mockRejectedValueOnce(new Error('disk full'));
    const { openResultsEditor } = await import('@/features/search/lib/open-results-editor');

    await expect(
      openResultsEditor(
        'main',
        {
          query: 'x',
          isRegex: false,
          caseSensitive: false,
          wholeWord: false,
          include: '',
          exclude: '',
          useIgnoreFiles: true,
        },
        [],
      ),
    ).rejects.toThrow('disk full');
    expect(openFile).not.toHaveBeenCalled();
  });
});
