import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { forgetLiveSessions } from '@/features/session';
import { ChangesStatusItem } from '@/features/session/components/changes/ChangesStatusItem';
import { claudePanelStore } from '@/features/session/store/claude-panel.store';
import { folderTabStore } from '@/features/workbench/store/folder-tab.store';
import { FOLDER } from '../../../support/editor';
import { aLiveSocket } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { routeApi, SESSION } from '../../../support/session-tools';

const t = translator('en');
const TAB = { path: FOLDER, name: 'app', rootLabel: null, state: 'available', kept: true } as const;

/** The changes of the session on screen, in the status bar — plan 08, B-28. */
describe('the changes in the status bar', () => {
  let live: LiveSocket;

  beforeEach(() => {
    forgetLiveSessions();
    live = aLiveSocket();
  });

  afterEach(() => {
    live.close();
    vi.restoreAllMocks();
  });

  it('is not there without a session, nor with nothing changed', async () => {
    routeApi({ [`/sessions/${SESSION}/changes`]: [{ promptId: null, files: [] }] });
    const { container } = render(<ChangesStatusItem tab={TAB} />);
    expect(container).toBeEmptyDOMElement();

    act(() => {
      folderTabStore(FOLDER).getState().showSession(SESSION);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('counts what is left to review, and opens the view of the changes', async () => {
    routeApi({
      [`/sessions/${SESSION}/changes`]: [
        {
          promptId: 'p1',
          files: [{ path: `${FOLDER}/a.ts`, kind: 'modified', promptId: 'p1', revision: 'r' }],
        },
      ],
    });
    folderTabStore(FOLDER).getState().showSession(SESSION);
    render(<ChangesStatusItem tab={TAB} />);

    const item = await screen.findByRole('button', {
      name: t('sessions.changes.statusLabel', { pending: 1, count: 1 }),
    });
    expect(item).toHaveTextContent(t('sessions.changes.status', { pending: 1 }));

    await userEvent.click(item);
    expect(claudePanelStore(FOLDER).getState().pane).toBe('changes');
  });
});
