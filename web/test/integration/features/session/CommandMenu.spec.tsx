import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { render, translator } from '../../../support/render';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import {
  aCommandDto,
  aCommandMenu,
  aRefusal,
  aWireError,
  routeApi,
  SESSION,
} from '../../../support/session-tools';

const t = translator('en');
const PATH = `/sessions/${SESSION}/commands`;

const openMenu = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: t('commands.menu.toggle') }));
};

const menu = (): HTMLElement => screen.getByRole('region', { name: t('commands.menu.title') });
const composer = (): HTMLElement => screen.getByLabelText(t('session.composer.label'));

/**
 * The slash commands on the session screen — plan 04, F3.
 *
 * The menu is discovery, not a fence ([D-05]): what it shows comes from the installation, a pick
 * writes into the prompt box and sends nothing, and the box never depends on the menu having loaded.
 */
describe('the command menu', () => {
  let live: LiveSocket;

  beforeEach(() => {
    forgetLiveSessions();
    live = aLiveSocket();
  });

  afterEach(() => {
    live.close();
    vi.restoreAllMocks();
  });

  const prompts = () => live.sent().filter((frame) => frame['type'] === 'session.prompt');

  it('asks for nothing until it is opened', () => {
    const get = routeApi({ [PATH]: [aCommandMenu()] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    expect(screen.getByRole('button', { name: t('commands.menu.toggle') })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // The header reads what it shows; the menu of commands is read only once it is opened.
    expect(get.mock.calls.filter(([path]) => path === PATH)).toEqual([]);
  });

  it('lists what the installation offers, suggested on top — S-29', async () => {
    routeApi({ [PATH]: [aCommandMenu()] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    await openMenu();

    const suggested = await screen.findByRole('list', { name: t('commands.menu.suggested') });
    const others = screen.getByRole('list', { name: t('commands.menu.all') });
    expect(
      within(suggested)
        .getAllByRole('button')
        .map((item) => item.textContent),
    ).toEqual(['/initInitialise AGENTS.md', '/review<pr>What /review does']);
    expect(within(others).getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByText(t('commands.menu.version', { version: '2.1.277' })),
    ).toBeInTheDocument();
  });

  it('shows fewer when the installation has fewer, and no group it has nothing for — S-30', async () => {
    routeApi({ [PATH]: [aCommandMenu([aCommandDto('cost')], null)] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    await openMenu();

    const others = await screen.findByRole('list', { name: t('commands.menu.all') });
    expect(within(others).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: t('commands.menu.suggested') })).toBeNull();
    expect(screen.queryByText(/Claude Code/)).toBeNull();
  });

  it('finds a command by its alias, and says when nothing matches', async () => {
    const user = userEvent.setup();
    routeApi({ [PATH]: [aCommandMenu()] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();
    await openMenu();
    await screen.findByRole('list', { name: t('commands.menu.suggested') });

    const search = within(menu()).getByLabelText(t('commands.menu.search'));
    await user.type(search, 'squash');

    expect(
      within(menu())
        .getAllByRole('button')
        .map((item) => item.textContent),
    ).toEqual(['/compactSummarise the conversation']);

    await user.clear(search);
    await user.type(search, 'heapdump');

    expect(
      within(menu()).getByText(t('commands.menu.noMatch', { search: 'heapdump' })),
    ).toBeInTheDocument();
  });

  it('writes a pick into the prompt box and sends nothing, until sent — S-32', async () => {
    const user = userEvent.setup();
    routeApi({ [PATH]: [aCommandMenu()] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();
    await openMenu();

    await user.click(await screen.findByRole('button', { name: /^\/init/ }));

    expect(composer()).toHaveValue('/init ');
    expect(composer()).toHaveFocus();
    expect(prompts()).toHaveLength(0);
    // The menu closes on a pick: the person is back at the box, adding arguments.
    expect(screen.queryByRole('region', { name: t('commands.menu.title') })).toBeNull();

    await user.click(screen.getByRole('button', { name: t('session.composer.send') }));

    expect(prompts()[0]).toMatchObject({ payload: { sessionId: SESSION, text: '/init' } });
  });

  it('replaces what was in the box rather than piling commands up', async () => {
    const user = userEvent.setup();
    routeApi({ [PATH]: [aCommandMenu()] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    await openMenu();
    await user.click(await screen.findByRole('button', { name: /^\/init/ }));
    await openMenu();
    await user.click(await screen.findByRole('button', { name: /^\/cost/ }));

    expect(composer()).toHaveValue('/cost ');
  });

  it.each([
    ['502', aWireError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable')],
    ['504', aWireError('CLAUDE_TIMEOUT', 'session.error.claudeTimeout')],
    ['no network', aWireError('NETWORK_UNREACHABLE', 'common.error.offline')],
  ])('says the menu is down on %s, and the box still sends — S-31', async (_case, failure) => {
    const user = userEvent.setup();
    routeApi({ [PATH]: [failure] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    await openMenu();

    const alert = await within(menu()).findByRole('alert');
    expect(alert).toHaveTextContent(t(String(failure['messageKey'])));
    expect(alert).toHaveTextContent(t('commands.menu.unavailable'));

    await user.type(composer(), '/init');
    await user.click(screen.getByRole('button', { name: t('session.composer.send') }));

    expect(prompts()[0]).toMatchObject({ payload: { text: '/init' } });
  });

  it('tries again, and shows the menu once it answers', async () => {
    routeApi({
      [PATH]: [
        aWireError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable'),
        aCommandMenu([aCommandDto('cost')]),
      ],
    });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();
    await openMenu();

    await userEvent.click(
      await within(menu()).findByRole('button', { name: t('common.action.retry') }),
    );

    expect(await screen.findByRole('button', { name: /^\/cost/ })).toBeInTheDocument();
    expect(within(menu()).queryByRole('alert')).toBeNull();
  });

  it('says so when the installation offers no command at all', async () => {
    routeApi({ [PATH]: [aCommandMenu([])] });
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    await openMenu();

    expect(await screen.findByText(t('commands.menu.emptyTitle'))).toBeInTheDocument();
    expect(screen.queryByText(t('commands.menu.noMatch', { search: '' }))).toBeNull();
    expect(composer()).toBeEnabled();
  });

  it('offers no menu once the session has ended', () => {
    render(<SessionScreen sessionId={SESSION} />);
    live.connect();

    live.receive(
      hubEvent(SESSION, 'session.closed', 1, { sessionId: SESSION, reason: 'completed' }),
    );

    expect(screen.queryByRole('button', { name: t('commands.menu.toggle') })).toBeNull();
  });

  describe('a command the installation does not have — S-34', () => {
    it('shows the translated refusal of this prompt beside the box, until the next one', async () => {
      const user = userEvent.setup();
      render(<SessionScreen sessionId={SESSION} />);
      live.connect();

      await user.type(composer(), '/nope');
      await user.click(screen.getByRole('button', { name: t('session.composer.send') }));
      const sent = String(prompts()[0]?.['id']);

      live.receive(
        aRefusal(sent, 'INVALID_INPUT', 'session.error.unknownCommand', { command: 'nope' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        t('session.error.unknownCommand', { command: 'nope' }),
      );

      await user.type(composer(), 'do the work');
      await user.click(screen.getByRole('button', { name: t('session.composer.send') }));

      await waitFor(() => {
        expect(screen.queryByRole('alert')).toBeNull();
      });
    });

    it('does not show the refusal of somebody else’s command', async () => {
      const user = userEvent.setup();
      render(<SessionScreen sessionId={SESSION} />);
      live.connect();

      await user.type(composer(), '/init');
      await user.click(screen.getByRole('button', { name: t('session.composer.send') }));
      live.receive(
        aRefusal('another-frame', 'INVALID_INPUT', 'session.error.unknownCommand', {
          command: 'nope',
        }),
      );

      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('has no accessibility violation with the menu open', async () => {
    routeApi({ [PATH]: [aCommandMenu()] });
    const { container } = render(<SessionScreen sessionId={SESSION} />);
    live.connect();
    await openMenu();
    await screen.findByRole('list', { name: t('commands.menu.suggested') });

    expect(await axe(container)).toHaveNoViolations();
  });
});
