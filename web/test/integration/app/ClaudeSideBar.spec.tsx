import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { aLiveSocket, hubEvent } from '../../support/live-socket';
import type { LiveSocket } from '../../support/live-socket';
import { translator } from '../../support/render';
import { startFromDraft } from '../../support/claude-panel';
import { draftOnScreen, openWorkbench, tabNamed, typeIn } from '../../support/workbench';
import { aTab, aTabServer, projects } from '../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-30T12:00:00.000Z';

let live: LiveSocket;

afterEach(() => {
  live.close();
  vi.restoreAllMocks();
});

/** The chat with Claude beside the editor. */
function claude(): HTMLElement {
  return screen.getByRole('complementary', { name: t('workbench.claude.label') });
}

/** The question the server asks about a tool: a `request` frame, with no sequence. */
function question(toolName: string): Record<string, unknown> {
  return {
    v: 1,
    id: 'frame-1',
    kind: 'request',
    type: 'permission.requested',
    ts: AT,
    sessionId: SESSION,
    payload: {
      requestId: 'req-1',
      toolUseId: 'toolu-1',
      toolName,
      title: `permission.tool.${toolName}`,
      description: 'npm test',
      input: { command: 'npm test' },
      riskHint: 'write',
      defaultToNo: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      suggestions: [{ scope: 'once', labelKey: 'permission.scope.once' }],
    },
  };
}

function attaches(): number {
  return live.sent().filter((frame) => frame['type'] === 'session.attach').length;
}

/** The workbench of A, connected, with a session started from its side bar. */
async function withASession(user: ReturnType<typeof userEvent.setup>) {
  live = aLiveSocket();
  const mounted = openWorkbench(A, aTabServer([aTab(A), aTab(B)]));
  live.connect();

  await startFromDraft(user, live, { id: SESSION, folder: A, text: 'first' });

  return mounted;
}

describe('the chat with Claude, in the folder tab — plan 06, S-115', () => {
  it('starts the session in the folder of the tab, and keeps it beside the editor', async () => {
    const user = userEvent.setup();
    const mounted = await withASession(user);

    expect(live.lastSent('session.start')).toMatchObject({
      payload: { workspacePath: A, permissionMode: 'default' },
    });
    // The first prompt goes once the session opened (plan 08, S-152).
    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: SESSION, text: 'first' },
    });
    // Still the tab of the folder: the chat never moves to a screen of its own.
    expect(mounted.path()).toBe('/workbench');
    expect(screen.getByRole('region', { name: t('workbench.editor.label') })).toBeVisible();
    expect(within(claude()).getByLabelText(t('composer.box.label'))).toBeVisible();
  });

  it('talks and shows what the session says, without leaving the tab', async () => {
    const user = userEvent.setup();
    await withASession(user);

    await typeIn(user, within(claude()).getByLabelText(t('composer.box.label')), 'run the tests');
    await user.click(within(claude()).getByRole('button', { name: t('session.composer.send') }));
    live.receive(
      hubEvent(SESSION, 'message.completed', 2, {
        messageId: 'm1',
        role: 'assistant',
        content: [{ type: 'text', text: 'All green.' }],
      }),
    );

    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: SESSION, text: 'run the tests' },
    });
    expect(await within(claude()).findByText('All green.')).toBeVisible();
  });

  it('asks and approves in the tab, the question above the conversation', async () => {
    const user = userEvent.setup();
    await withASession(user);

    live.receive(question('Bash'));

    const card = await within(claude()).findByRole('listitem', { name: /Bash/ });
    await user.click(within(card).getByRole('button', { name: t('permission.scope.once') }));

    expect(live.lastSent('permission.resolve')).toMatchObject({
      payload: { requestId: 'req-1', decision: 'allow' },
    });
  });

  it('leads from a "don’t ask again" to the rules that take it back — plan 03, D-04', async () => {
    const user = userEvent.setup();
    const mounted = await withASession(user);
    const rule = { pattern: 'Bash(npm test)', lifetimeMs: 90 * 86_400_000 };
    const asked = question('Bash');
    live.receive({
      ...asked,
      payload: {
        ...(asked['payload'] as Record<string, unknown>),
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'project', labelKey: 'permission.scope.project', ...rule },
        ],
      },
    });

    await user.click(
      await within(claude()).findByRole('button', { name: t('permission.scope.project') }),
    );
    await user.click(
      within(claude()).getByRole('button', { name: t('permission.persist.openRules') }),
    );

    await waitFor(() => {
      expect(mounted.path()).toBe('/rules');
    });
  });

  it('starts a new session in the same folder from the side bar', async () => {
    const user = userEvent.setup();
    await withASession(user);

    await user.click(within(claude()).getByRole('button', { name: t('sessions.tabs.new') }));

    expect(await draftOnScreen()).toBeVisible();
    // The session goes on in its own tab of the panel.
    expect(
      within(within(claude()).getByRole('list', { name: t('sessions.tabs.label') })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    expect(live.lastSent('session.close')).toBeUndefined();
  });
});

describe('a session of a tab that is not on screen — plan 06, S-181, S-99, S-100', () => {
  it('stays attached: the question and the stream arrive, and coming back attaches nothing again', async () => {
    const user = userEvent.setup();
    const mounted = await withASession(user);
    const attachedBefore = attaches();
    expect(attachedBefore).toBeGreaterThan(0);

    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
    await draftOnScreen();

    // While B is on screen, A's session asks and speaks.
    live.receive(question('Bash'));
    live.receive(
      hubEvent(SESSION, 'message.completed', 2, {
        messageId: 'm1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Said while away.' }],
      }),
    );
    expect(live.sent().filter((frame) => frame['type'] === 'session.detach')).toEqual([]);

    await user.click(await tabNamed('a'));

    expect(await within(claude()).findByRole('listitem', { name: /Bash/ })).toBeVisible();
    expect(within(claude()).getByText('Said while away.')).toBeVisible();
    expect(attaches()).toBe(attachedBefore);
  });

  it('stays attached on the other screens of the app, and the question waits in its tab', async () => {
    const user = userEvent.setup();
    const mounted = await withASession(user);
    const attachedBefore = attaches();

    await user.click(screen.getByRole('link', { name: t('navigation.entry.audit') }));
    await waitFor(() => {
      expect(mounted.path()).toBe('/audit');
    });
    live.receive(question('Bash'));
    expect(live.sent().filter((frame) => frame['type'] === 'session.detach')).toEqual([]);

    await user.click(screen.getByRole('link', { name: t('navigation.entry.workbench') }));
    expect(
      await within(
        await screen.findByRole('complementary', { name: t('workbench.claude.label') }),
      ).findByRole('listitem', { name: /Bash/ }),
    ).toBeVisible();
    expect(attaches()).toBe(attachedBefore);
  });

  it('keeps the half-written prompt of each tab to itself, and gives it back', async () => {
    const user = userEvent.setup();
    await withASession(user);
    await typeIn(user, within(claude()).getByLabelText(t('composer.box.label')), 'half a thought');

    await user.click(await tabNamed('b'));
    expect(await draftOnScreen()).toBeVisible();

    await user.click(await tabNamed('a'));
    expect(await within(claude()).findByLabelText(t('composer.box.label'))).toHaveValue(
      'half a thought',
    );
  });

  it('lets go of the session when its tab closes — and never ends it', async () => {
    const user = userEvent.setup();
    await withASession(user);
    await user.click(await tabNamed('b'));
    await draftOnScreen();

    await user.click(
      screen.getByRole('button', { name: t('workbench.tabs.close', { name: 'a' }) }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('workbench.close.confirm') }));

    await waitFor(() => {
      expect(live.lastSent('session.detach')).toMatchObject({ payload: { sessionId: SESSION } });
    });
    expect(live.lastSent('session.close')).toBeUndefined();
  });
});
