import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import { api } from '@/shared/api/api';
import type { RequestOptions } from '@/shared/api/api';
import { FOLDER, editorOf, pressSave, renderEditor, typeInto } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

/** The saves answer with what the local history did with the version each replaced, in turn. */
function historyAnswers(...answers: readonly unknown[]): void {
  const save = vi.mocked(api.put).getMockImplementation();
  const queue = [...answers];

  vi.spyOn(api, 'put').mockImplementation(
    async (route: string, body: unknown, options?: RequestOptions) => {
      const written = (await save?.(route, body, options)) as Record<string, unknown>;
      return { ...written, history: queue.shift() ?? null } as never;
    },
  );
}

describe('a save whose replaced version stayed out of the local history — plan 07, S-336', () => {
  it.each([
    ['tooLarge', 'editor.history.tooLarge'],
    ['unavailable', 'editor.history.unavailable'],
  ] as const)(
    'goes through, and the tab says the version was not kept (%s)',
    async (reason, key) => {
      const user = userEvent.setup();
      const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
      historyAnswers({ kept: false, reason }, { kept: true, entryId: 'h-2' });
      renderEditor();
      act(() => {
        openFile(FOLDER, 'a.ts');
      });
      const editor = await editorOf('a.ts');

      typeInto(editor, 'two');
      pressSave(editor);

      const notice = await screen.findByText(t(key, { path: 'a.ts' }));
      expect(notice).toBeVisible();
      expect(disk.files.get('a.ts')?.content).toBe('two');

      await user.click(screen.getByRole('button', { name: t('editor.history.dismiss') }));
      expect(screen.queryByText(t(key, { path: 'a.ts' }))).toBeNull();

      typeInto(editor, 'three');
      pressSave(editor);
      await waitFor(() => {
        expect(disk.files.get('a.ts')?.content).toBe('three');
      });
      expect(screen.queryByText(t(key, { path: 'a.ts' }))).toBeNull();
    },
  );

  it('says nothing when the version was kept, or nothing was written', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one' });
    historyAnswers({ kept: true, entryId: 'h-1' });
    renderEditor();
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    const editor = await editorOf('a.ts');

    typeInto(editor, 'two');
    pressSave(editor);

    await waitFor(() => {
      expect(disk.files.get('a.ts')?.content).toBe('two');
    });
    expect(screen.queryByText(t('editor.history.tooLarge', { path: 'a.ts' }))).toBeNull();
    expect(screen.queryByText(t('editor.history.unavailable', { path: 'a.ts' }))).toBeNull();
  });
});
