import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SessionMenu } from '@/features/session/components/panel/SessionMenu';
import { StatusDot } from '@/features/session/components/panel/StatusDot';
import type { SessionHeaderState } from '@/features/session/hooks/useSessionHeader';
import { render, translator } from '../../../support/render';

const t = translator('en');
const A = '/srv/projects/app';
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A session as the header reads it — idle, connected, this browser's, with no turn yet. */
function aSession(overrides: Partial<SessionHeaderState> = {}): SessionHeaderState {
  return {
    sessionId: SESSION,
    status: 'idle',
    connection: 'ready',
    costUsd: '0',
    turns: 0,
    isOwner: true,
    ended: false,
    conversationId: 'conv-1',
    close: vi.fn(),
    ...overrides,
  };
}

const dot = (): HTMLElement => screen.getByRole('img');

describe('where the session stands — plan 09, B-18', () => {
  it.each([
    ['connected', aSession(), 'sessions.dot.connected', 'bg-success'],
    ['running', aSession({ status: 'thinking' }), 'sessions.dot.running', 'bg-primary'],
    ['waiting', aSession({ status: 'waitingPermission' }), 'sessions.dot.running', 'bg-primary'],
    [
      'reconnecting',
      aSession({ connection: 'reconnecting' }),
      'sessions.dot.reconnecting',
      'bg-warning',
    ],
    ['ended', aSession({ ended: true }), 'sessions.dot.ended', 'bg-muted-foreground'],
    ['closed', aSession({ status: 'closed' }), 'sessions.dot.ended', 'bg-muted-foreground'],
  ])(
    'says %s by colour and by word, with the id of the session — S-38',
    (_name, session, word, colour) => {
      render(<StatusDot session={session} />);

      expect(dot()).toHaveAccessibleName(
        `${t(word)} · ${t('sessions.dot.session', { sessionId: SESSION })}`,
      );
      expect(dot().firstElementChild).toHaveClass(colour);
    },
  );

  it('says no cost before the first turn, never "$0" — S-43', () => {
    render(<StatusDot session={aSession()} />);

    expect(dot().getAttribute('aria-label')).not.toMatch(/\$/);
  });

  it('says what the session has cost since it opened, after its turns — D-11, S-43', () => {
    render(<StatusDot session={aSession({ costUsd: '0.0223', turns: 2 })} />);

    expect(dot().getAttribute('aria-label')).toContain(
      t('sessions.status.cost', { cost: '$0.0223', turns: 2 }),
    );
  });

  it('says it in its tooltip too', async () => {
    const user = userEvent.setup();
    render(<StatusDot session={aSession()} />);

    await user.hover(dot());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(t('sessions.dot.connected'));
  });
});

describe('the menu of the session — plan 09, B-17', () => {
  async function opened(
    session: SessionHeaderState | null,
    extra: { onOpenRules?: () => void; onOpenHelp?: () => void } = {},
  ) {
    const user = userEvent.setup();
    const help = extra.onOpenHelp ?? vi.fn();
    // A browser that has notifications, and was not asked yet.
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    render(
      <SessionMenu
        session={session}
        folder={A}
        onOpenHelp={help}
        onOpenRules={extra.onOpenRules}
      />,
    );
    await user.click(screen.getByRole('button', { name: t('sessions.menu.open') }));
    return { user, menu: await screen.findByRole('menu'), help };
  }

  const names = (menu: HTMLElement): string[] =>
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);

  it('holds end, export, undo, copy the id, notifications, rules and help — S-41', async () => {
    const { menu } = await opened(aSession(), { onOpenRules: vi.fn() });

    expect(names(menu)).toEqual([
      t('session.controls.close'),
      t('sessions.export.open'),
      t('sessions.menu.undo'),
      t('sessions.menu.copyId'),
      t('sessions.browserNotice.turnOn'),
      t('sessions.menu.rules'),
      t('claudePanel.help.open'),
    ]);
  });

  it('holds only what holds without a session, in a draft — S-41', async () => {
    const { menu } = await opened(null, { onOpenRules: vi.fn() });

    expect(names(menu)).toEqual([
      t('sessions.browserNotice.turnOn'),
      t('sessions.menu.rules'),
      t('claudePanel.help.open'),
    ]);
  });

  it('opens the rules and the help — S-41', async () => {
    const rules = vi.fn();
    const first = await opened(null, { onOpenRules: rules });
    await first.user.click(
      within(first.menu).getByRole('menuitem', { name: t('sessions.menu.rules') }),
    );
    expect(rules).toHaveBeenCalledTimes(1);

    await first.user.click(screen.getByRole('button', { name: t('sessions.menu.open') }));
    await first.user.click(
      await screen.findByRole('menuitem', { name: t('claudePanel.help.open') }),
    );
    expect(first.help).toHaveBeenCalledTimes(1);
  });

  it('asks before ending, keeps the session on cancel, and ends it on confirm — S-39, D-10', async () => {
    const session = aSession();
    const { user, menu } = await opened(session);

    await user.click(within(menu).getByRole('menuitem', { name: t('session.controls.close') }));
    const dialog = await screen.findByRole('dialog', { name: t('sessions.close.title') });
    expect(dialog).toHaveAccessibleDescription(t('sessions.close.description'));
    // The way out is where the focus starts.
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: t('sessions.close.keep') })).toHaveFocus();
    });
    await user.click(within(dialog).getByRole('button', { name: t('sessions.close.keep') }));
    expect(session.close).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: t('sessions.menu.open') }));
    await user.click(await screen.findByRole('menuitem', { name: t('session.controls.close') }));
    await user.click(await screen.findByRole('button', { name: t('sessions.close.confirm') }));

    expect(session.close).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('keeps ending from whoever did not open the session, and says why — S-40', async () => {
    const { menu } = await opened(aSession({ isOwner: false }));

    const end = within(menu).getByRole('menuitem', {
      name: new RegExp(t('session.controls.close')),
    });
    expect(end).toHaveAttribute('aria-disabled', 'true');
    expect(end).toHaveTextContent(t('session.controls.closeNotOwner'));
  });

  it('offers no end of a session that already ended', async () => {
    const { menu } = await opened(aSession({ ended: true }));

    expect(
      within(menu).getByRole('menuitem', { name: t('session.controls.close') }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the undo of the session as a dialog', async () => {
    const { user, menu } = await opened(aSession());

    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.menu.undo') }));

    expect(await screen.findByRole('dialog', { name: t('undo.panel.title') })).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('undo.panel.close') }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('copies the id of the session, and says so', async () => {
    const { user, menu } = await opened(aSession());

    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.menu.copyId') }));

    expect(await screen.findByRole('status')).toHaveTextContent(t('sessions.menu.copied'));
    expect(await navigator.clipboard.readText()).toBe(SESSION);
  });

  it('gives the id to copy by hand when the browser refuses the clipboard', async () => {
    const { user, menu } = await opened(aSession());
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('refused'));

    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.menu.copyId') }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      t('sessions.menu.copyFailed', { sessionId: SESSION }),
    );
  });

  it('closes the export with its own button', async () => {
    const { user, menu } = await opened(aSession());

    await user.click(within(menu).getByRole('menuitem', { name: t('sessions.export.open') }));
    await user.click(await screen.findByRole('button', { name: t('sessions.export.close') }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('has no accessibility violation, open', async () => {
    const { menu } = await opened(aSession({ isOwner: false }));

    expect(await axe(menu)).toHaveNoViolations();
  });
});
