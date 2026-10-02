import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

import { editorAreas, folderTabKeepers } from '@/features/workbench';
import { CloseFoldersDialog } from '@/features/workbench/components/CloseFoldersDialog';
import { EditorArea } from '@/features/workbench/components/EditorArea';
import type { FolderTabs } from '@/features/workbench/hooks/useFolderTabs';
import { render, translator } from '../../../support/render';

const t = translator('en');
const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.restoreAllMocks();
});

describe('the editor area — plan 07, F5', () => {
  it('says what will live there while nobody fills it, and shows whoever registers', () => {
    const { rerender } = render(<EditorArea folder="/srv/app" />);
    expect(screen.getByText(t('workbench.editor.placeholderTitle'))).toBeVisible();

    stops.push(
      editorAreas.register({
        id: 'editor',
        position: 1,
        component: ({ folder }) => <p>{folder}</p>,
      }),
    );
    rerender(<EditorArea folder="/srv/app" />);
    expect(screen.getByRole('region', { name: t('workbench.editor.label') })).toHaveTextContent(
      '/srv/app',
    );
  });
});

/** The tabs control of the dialog, asking to close `closing`. */
function aControl(closing: readonly string[]): FolderTabs {
  return {
    closing,
    isClosing: false,
    failure: null,
    cancelClose: vi.fn(),
    confirmClose: vi.fn(),
  } as unknown as FolderTabs;
}

describe('closing folder tabs with unsaved changes — plan 07, S-262', () => {
  it('lists what each keeper says closing would lose, under its folder when several close', () => {
    stops.push(
      folderTabKeepers.register({
        id: 'editor',
        position: 1,
        unsaved: (folder) => (folder === '/srv/a' ? ['src/x.ts'] : ['y.ts']),
      }),
    );

    render(<CloseFoldersDialog control={aControl(['/srv/a', '/srv/b'])} />);

    const list = screen.getByRole('list', { name: t('workbench.close.unsavedLabel') });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['/srv/a/src/x.ts', '/srv/b/y.ts']);
  });

  it('says nothing of unsaved changes when there are none', () => {
    render(<CloseFoldersDialog control={aControl(['/srv/a'])} />);

    expect(screen.queryByText(t('workbench.close.unsaved'))).toBeNull();
  });
});
