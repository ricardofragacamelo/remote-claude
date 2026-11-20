import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SearchTextFramePayload } from '@remote-claude/contracts';

import { ResultsEditorChrome } from '@/features/search/components/ResultsEditorChrome';
import { serializeCodeSearch } from '@/features/search/lib/code-search-format';
import type { CodeSearchHeader } from '@/features/search/lib/code-search-format';
import { render, translator } from '../../../support/render';
import { fakeSearchApi } from '../../../support/search-api';

const FOLDER = '/srv/projects/a';
const t = translator('en');

const { openFile } = vi.hoisted(() => ({ openFile: vi.fn() }));
vi.mock('@/features/editor', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor')>('@/features/editor');
  return { ...actual, openFile, activeView: () => null };
});

afterEach(() => {
  vi.restoreAllMocks();
  openFile.mockReset();
});

function aHeader(overrides: Partial<CodeSearchHeader> = {}): CodeSearchHeader {
  return {
    query: 'TODO',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    include: '',
    exclude: '',
    useIgnoreFiles: true,
    contextLines: 1,
    ...overrides,
  };
}

function aModel(text: string) {
  let value = text;
  const listeners = new Set<() => void>();
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn((next: string) => {
      value = next;
      for (const listener of listeners) listener();
    }),
    onDidChange: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
}

function mount(model: ReturnType<typeof aModel>) {
  return render(
    <ResultsEditorChrome
      folder={FOLDER}
      group="main"
      doc={{ path: 'r.code-search', model } as never}
    />,
  );
}

describe('ResultsEditorChrome — plan 11, B-17', () => {
  it('shows the query it was opened with, and the read-only notice (S-132, S-133)', () => {
    const model = aModel(serializeCodeSearch(aHeader({ query: 'fix me' }), []));
    mount(model);

    expect(screen.getByText('fix me')).toBeVisible();
    expect(screen.getByText(t('search.resultsEditor.readOnlyNotice'))).toBeVisible();
  });

  it('the context-lines spinner accepts only 1–9, and rewrites just that header line', () => {
    const model = aModel(serializeCodeSearch(aHeader({ contextLines: 1 }), []));
    mount(model);

    const spinner = screen.getByRole('spinbutton', {
      name: t('search.resultsEditor.contextLines'),
    });
    expect(spinner).toHaveAttribute('min', '1');
    expect(spinner).toHaveAttribute('max', '9');

    fireEvent.change(spinner, { target: { value: '5' } });

    expect(model.setValue).toHaveBeenLastCalledWith(expect.stringContaining('# ContextLines: 5'));
  });

  it('clamps a value past the spinner’s own ceiling to 9, never past it', () => {
    const model = aModel(serializeCodeSearch(aHeader({ contextLines: 1 }), []));
    mount(model);

    const spinner = screen.getByRole('spinbutton', {
      name: t('search.resultsEditor.contextLines'),
    });
    fireEvent.change(spinner, { target: { value: '42' } });

    expect(model.setValue).toHaveBeenLastCalledWith(expect.stringContaining('# ContextLines: 9'));
  });

  it('ignores a non-numeric spinner value, instead of writing anything', () => {
    const model = aModel(serializeCodeSearch(aHeader({ contextLines: 1 }), []));
    mount(model);

    const spinner = screen.getByRole('spinbutton', {
      name: t('search.resultsEditor.contextLines'),
    });
    fireEvent.change(spinner, { target: { value: '' } });

    expect(model.setValue).not.toHaveBeenCalled();
  });

  it('typing never calls a write API — only the document’s own buffer ever changes (S-133)', () => {
    const model = aModel(serializeCodeSearch(aHeader(), []));
    mount(model);

    const spinner = screen.getByRole('spinbutton', {
      name: t('search.resultsEditor.contextLines'),
    });
    fireEvent.change(spinner, { target: { value: '3' } });

    expect(openFile).not.toHaveBeenCalled();
  });

  it('"run again" re-runs the search and shows the fresh results in the buffer', async () => {
    fakeSearchApi({
      text: (): readonly SearchTextFramePayload[] => [
        {
          type: 'file',
          path: 'src/a.ts',
          matches: [
            {
              line: 9,
              column: 1,
              endColumn: 5,
              preview: 'fix',
              previewMatchStart: 0,
              previewMatchEnd: 3,
            },
          ],
          contextLines: [],
        },
        { type: 'end' },
      ],
    });
    const model = aModel(serializeCodeSearch(aHeader(), []));
    const user = userEvent.setup();
    mount(model);

    await user.click(screen.getByRole('button', { name: t('search.resultsEditor.runAgain') }));

    await waitFor(() => {
      expect(model.setValue).toHaveBeenCalledWith(expect.stringContaining('src/a.ts:\n  9: fix'));
    });
  });

  it('shows a translated error when "run again" fails, without losing the header', async () => {
    fakeSearchApi({
      text: () => {
        throw new Error('boom');
      },
    });
    const model = aModel(serializeCodeSearch(aHeader({ query: 'fix me' }), []));
    const user = userEvent.setup();
    mount(model);

    await user.click(screen.getByRole('button', { name: t('search.resultsEditor.runAgain') }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeVisible();
    });
    expect(screen.getByText('fix me')).toBeVisible();
  });
});
