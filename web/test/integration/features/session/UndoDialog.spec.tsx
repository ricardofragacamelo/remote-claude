import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { UndoDialog } from '@/features/session/components/panel/UndoDialog';
import { render, translator } from '../../../support/render';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import {
  aCheckpointDto,
  anIncompleteRewind,
  aRefusal,
  aRewoundPayload,
  aWireError,
  AT,
  routeApi,
  SESSION,
} from '../../../support/session-tools';

const t = translator('en');
const PATH = `/sessions/${SESSION}/checkpoints`;

/** How many times the points were asked for — the header's own reads are not the panel's. */
const readsOf = (get: { readonly mock: { readonly calls: readonly unknown[][] } }): number =>
  get.mock.calls.filter(([path]) => path === PATH).length;

const panel = (): HTMLElement => screen.getByRole('dialog', { name: t('undo.panel.title') });

/**
 * The screen of the session and the way into its undo — the item of the menu of the session since
 * plan 09 (B-17), which opens the dialog.
 */
function Undoing(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SessionScreen sessionId={SESSION} />
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('sessions.menu.undo')}
      </button>
      {open && (
        <UndoDialog
          sessionId={SESSION}
          open
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
const confirmation = (): HTMLElement =>
  screen.getByRole('group', { name: t('undo.confirm.title') });
const group = (scope: HTMLElement, title: string): string[] =>
  within(within(scope).getByRole('list', { name: title }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');

/**
 * Undoing what the session wrote — plan 04, F4.
 *
 * Two steps, because confirmation without the list is confirmation without information: the reach
 * of undoing to a point is shown file by file — back, deleted, kept and why, already there — and
 * only then is the undo sent. And it is an operation on the user's disk, so it is refused while a
 * turn runs and unavailable once the session is over.
 */
describe('the undo of the session — a dialog of its menu since plan 09, B-17', () => {
  let live: LiveSocket;

  beforeEach(() => {
    forgetLiveSessions();
    live = aLiveSocket();
  });

  afterEach(() => {
    live.close();
    vi.restoreAllMocks();
  });

  const rewinds = () => live.sent().filter((frame) => frame['type'] === 'session.rewindFiles');

  /** The screen of an idle session, with the panel open. */
  async function openIdle(): Promise<void> {
    render(<Undoing />);
    live.connect();
    live.receive(hubEvent(SESSION, 'session.statusChanged', 1, { status: 'idle' }));
    await userEvent.click(screen.getByRole('button', { name: t('sessions.menu.undo') }));
  }

  async function choose(name: RegExp | string): Promise<void> {
    await userEvent.click(await within(panel()).findByRole('button', { name }));
  }

  it('asks for nothing until it is opened', () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [] }] });
    render(<Undoing />);
    live.connect();

    expect(readsOf(get)).toBe(0);
  });

  it('lists the points, newest first, naming an unlabelled one', async () => {
    routeApi({
      [PATH]: [
        {
          checkpoints: [
            aCheckpointDto({ promptId: 'p2' }),
            aCheckpointDto({ promptId: 'p1', label: null }),
          ],
        },
      ],
    });
    await openIdle();

    const points = await within(panel()).findByRole('list', { name: t('undo.panel.title') });
    const rows = within(points).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('refactor the parser');
    expect(rows[0]).toHaveTextContent(t('undo.panel.startedAt', { at: AT }));
    expect(rows[1]).toHaveTextContent(t('undo.panel.untitled'));
  });

  it('says what goes back, what is deleted, what stays and why, and to which point — S-38', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();

    await choose(/refactor the parser/);

    expect(confirmation()).toHaveTextContent(
      t('undo.confirm.target', { label: 'refactor the parser', at: AT }),
    );
    expect(group(confirmation(), t('undo.scope.restore'))).toEqual(['/srv/app/a.ts']);
    expect(group(confirmation(), t('undo.scope.remove'))).toEqual(['/srv/app/new.ts']);
    expect(group(confirmation(), t('undo.scope.preserve'))).toEqual([
      `/srv/app/b.ts${t('undo.reason.modifiedOutside')}`,
    ]);
    expect(group(confirmation(), t('undo.scope.unchanged'))).toEqual(['/srv/app/c.ts']);
    // The focus goes to the way out, never to the undo: the accident is one stray Enter.
    expect(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.cancel') }),
    ).toHaveFocus();
  });

  it('names the untitled point in the confirmation too', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto({ label: null })] }] });
    await openIdle();

    await choose(new RegExp(t('undo.panel.untitled')));

    expect(confirmation()).toHaveTextContent(
      t('undo.confirm.target', { label: t('undo.panel.untitled'), at: AT }),
    );
  });

  it('offers nothing to confirm where nothing would go back, and says why', async () => {
    routeApi({
      [PATH]: [
        {
          checkpoints: [
            aCheckpointDto({
              files: [
                { path: '/srv/app/b.ts', outcome: 'preserve', reason: 'noBaseline' },
                { path: '/srv/app/c.ts', outcome: 'unchanged' },
              ],
            }),
          ],
        },
      ],
    });
    await openIdle();

    await choose(/refactor the parser/);

    expect(within(confirmation()).getByText(t('undo.confirm.nothing'))).toBeInTheDocument();
    expect(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    ).toBeDisabled();
    expect(group(confirmation(), t('undo.scope.preserve'))).toEqual([
      `/srv/app/b.ts${t('undo.reason.noBaseline')}`,
    ]);
  });

  it('goes back to the list without sending anything on cancel', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();
    await choose(/refactor the parser/);

    await userEvent.click(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.cancel') }),
    );

    expect(screen.queryByRole('group', { name: t('undo.confirm.title') })).toBeNull();
    expect(rewinds()).toHaveLength(0);
  });

  it('sends the undo, waits for it, and shows what it did — S-37, S-63', async () => {
    const get = routeApi({
      [PATH]: [
        { checkpoints: [aCheckpointDto()] },
        {
          checkpoints: [
            aCheckpointDto({ files: [{ path: '/srv/app/a.ts', outcome: 'unchanged' }] }),
          ],
        },
      ],
    });
    await openIdle();
    await choose(/refactor the parser/);

    await userEvent.click(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    );

    expect(rewinds()).toHaveLength(1);
    expect(rewinds()[0]).toMatchObject({ payload: { sessionId: SESSION, promptId: 'prompt-2' } });
    expect(within(panel()).getByRole('status')).toHaveTextContent(t('undo.panel.rewinding'));
    expect(within(panel()).getByRole('button', { name: /refactor the parser/ })).toBeDisabled();

    live.receive(hubEvent(SESSION, 'session.rewound', 2, aRewoundPayload()));

    const report = within(panel()).getByRole('region', { name: t('undo.outcome.title') });
    expect(group(report, t('undo.outcome.restored'))).toEqual(['/srv/app/a.ts']);
    expect(group(report, t('undo.outcome.deleted'))).toEqual(['/srv/app/new.ts']);
    expect(group(report, t('undo.outcome.preserved'))).toEqual([
      `/srv/app/b.ts${t('undo.reason.modifiedOutside')}`,
    ]);
    expect(group(report, t('undo.outcome.unchanged'))).toEqual(['/srv/app/c.ts']);
    expect(within(report).queryByRole('list', { name: t('undo.outcome.failed') })).toBeNull();
    expect(within(panel()).queryByRole('status')).toBeNull();
    await waitFor(() => {
      expect(readsOf(get)).toBe(2);
    });
  });

  it('reports a second undo to the same point as changing nothing — S-41', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();

    live.receive(
      hubEvent(
        SESSION,
        'session.rewound',
        2,
        aRewoundPayload({ reverted: [], preserved: [], unchanged: [], failed: [] }),
      ),
    );

    const report = within(panel()).getByRole('region', { name: t('undo.outcome.title') });
    expect(report).toHaveTextContent(t('undo.outcome.nothing'));
  });

  it('shows what could not be put back, and says the undo stopped short — S-44, S-62', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();
    await choose(/refactor the parser/);
    await userEvent.click(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    );

    live.receive(
      hubEvent(
        SESSION,
        'session.rewound',
        2,
        aRewoundPayload({
          reverted: [{ path: '/srv/app/new.ts', action: 'deleted' }],
          failed: [{ path: '/srv/app/a.ts' }],
        }),
      ),
      anIncompleteRewind(SESSION, 1),
    );

    const report = within(panel()).getByRole('region', { name: t('undo.outcome.title') });
    expect(group(report, t('undo.outcome.failed'))).toEqual(['/srv/app/a.ts']);
    expect(within(panel()).getByRole('alert')).toHaveTextContent(
      t('session.error.rewindIncomplete', { failed: 1 }),
    );
  });

  it.each([
    ['a turn is running — S-43', 'SESSION_LOCKED', 'session.error.locked'],
    ['the point is not one — S-61', 'INVALID_INPUT', 'session.error.rewindTargetUnknown'],
    ['the session is gone', 'SESSION_NOT_FOUND', 'session.error.notFound'],
    ['the trail is down', 'INTERNAL_ERROR', 'common.error.unexpected'],
  ])('says why the undo was refused when %s', async (_case, code, messageKey) => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();
    await choose(/refactor the parser/);
    await userEvent.click(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    );

    live.receive(aRefusal(String(rewinds()[0]?.['id']), code, messageKey));

    expect(within(panel()).getByRole('alert')).toHaveTextContent(t(messageKey));
    expect(within(panel()).queryByRole('status')).toBeNull();
    expect(within(panel()).getByRole('button', { name: /refactor the parser/ })).toBeEnabled();
  });

  it('disables the undo while a turn runs, and says why — S-43', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    await openIdle();
    await choose(/refactor the parser/);

    live.receive(hubEvent(SESSION, 'session.statusChanged', 2, { status: 'running' }));

    expect(within(panel()).getByRole('note')).toHaveTextContent(t('undo.panel.busy'));
    expect(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    ).toBeDisabled();

    live.receive(hubEvent(SESSION, 'session.statusChanged', 3, { status: 'idle' }));

    expect(
      within(confirmation()).getByRole('button', { name: t('undo.confirm.confirm') }),
    ).toBeEnabled();
  });

  it('asks for the points again when a turn completes', async () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [] }] });
    await openIdle();
    await waitFor(() => {
      expect(readsOf(get)).toBe(1);
    });

    live.receive(
      hubEvent(SESSION, 'turn.completed', 2, {
        turnId: 't1',
        usage: {},
        costUsd: '0.01',
        durationMs: 10,
      }),
    );

    await waitFor(() => {
      expect(readsOf(get)).toBe(2);
    });
  });

  it('says undo is not available once the session has ended, and asks for nothing — S-39', async () => {
    const get = routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    render(<Undoing />);
    live.connect();
    live.receive(
      hubEvent(SESSION, 'session.closed', 1, { sessionId: SESSION, reason: 'completed' }),
    );

    await userEvent.click(screen.getByRole('button', { name: t('sessions.menu.undo') }));

    expect(within(panel()).getByRole('note')).toHaveTextContent(t('undo.panel.ended'));
    expect(within(panel()).queryByRole('list')).toBeNull();
    expect(readsOf(get)).toBe(0);
  });

  it('says there is nothing to undo yet', async () => {
    routeApi({ [PATH]: [{ checkpoints: [] }] });
    await openIdle();

    expect(await within(panel()).findByText(t('undo.panel.emptyTitle'))).toBeInTheDocument();
  });

  it('says why the points could not be read, and tries again', async () => {
    routeApi({
      [PATH]: [
        aWireError('SESSION_NOT_FOUND', 'session.error.notFound'),
        { checkpoints: [aCheckpointDto()] },
      ],
    });
    await openIdle();

    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      t('session.error.notFound'),
    );

    await userEvent.click(within(panel()).getByRole('button', { name: t('common.action.retry') }));

    expect(
      await within(panel()).findByRole('button', { name: /refactor the parser/ }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation with a confirmation open', async () => {
    routeApi({ [PATH]: [{ checkpoints: [aCheckpointDto()] }] });
    const { container } = render(<Undoing />);
    live.connect();
    live.receive(hubEvent(SESSION, 'session.statusChanged', 1, { status: 'idle' }));
    await userEvent.click(screen.getByRole('button', { name: t('sessions.menu.undo') }));
    await choose(/refactor the parser/);

    expect(container).toBeInTheDocument();
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
