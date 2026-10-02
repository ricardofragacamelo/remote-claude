import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { registerClaudeChanges, registerSessionsView } from '@/features/session';
import { claudePanelStore } from '@/features/session/store/claude-panel.store';
import { rememberModels, useKnownModels } from '@/features/session/store/known-models.store';
import { folderTabStore } from '@/features/workbench';
import { onNotify } from '@/shared/lib/notify';
import type { Notification as AppNotification } from '@/shared/lib/notify';
import { claudeAside, startedFrame, startFromDraft } from '../../support/claude-panel';
import { aLiveSocket, hubEvent } from '../../support/live-socket';
import type { LiveSocket } from '../../support/live-socket';
import { translator } from '../../support/render';
import { aRefusal } from '../../support/session-tools';
import { draftOnScreen, openWorkbench, tabNamed, typeIn } from '../../support/workbench';
import { aTab, aTabServer, projects } from '../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const B = `${projects.path}/b`;
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const AT = '2026-09-30T12:00:00.000Z';

const OPUS = {
  value: 'opus',
  resolvedModel: 'claude-opus-5',
  displayName: 'Opus',
  description: 'Most capable',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'high'] as const,
};
const HAIKU = {
  value: 'haiku',
  resolvedModel: null,
  displayName: 'Haiku',
  description: 'Fastest',
  supportsEffort: false,
  supportedEffortLevels: [] as const,
};

let live: LiveSocket;
let unregister: (() => void)[] = [];

beforeEach(() => {
  live = aLiveSocket();
  unregister = [registerClaudeChanges(), registerSessionsView()];
});

afterEach(() => {
  live.close();
  for (const undo of unregister) {
    undo();
  }
  useKnownModels.setState({ byFolder: {} });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The workbench of `folder` over the tabs of A and B, connected, the draft of its panel on screen. */
async function onWorkbench(folder = A) {
  const mounted = openWorkbench(folder, aTabServer([aTab(A), aTab(B)]));
  live.connect();
  await draftOnScreen();
  return mounted;
}

const panelTabs = (): HTMLElement[] =>
  within(within(claudeAside()).getByRole('list', { name: t('sessions.tabs.label') })).getAllByRole(
    'listitem',
  );
const starts = (): Record<string, unknown>[] =>
  live.sent().filter((frame) => frame['type'] === 'session.start');

/**
 * Picks in a menu of the panel. From the keyboard: in jsdom every element measures 0 × 0 at the
 * origin, and the resizable panels take a pointer there as a grab of their handle.
 */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  trigger: string,
  item: string | RegExp,
): Promise<void> {
  within(claudeAside()).getByRole('button', { name: trigger }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

/** A press on the page, nothing focused — the shortcuts work with the focus anywhere (S-185). */
function press(key: string, code: string): void {
  act(() => {
    fireEvent.keyDown(document.body, { key, code, ctrlKey: true, altKey: true });
  });
}

/** Claude asking about a tool in `SESSION`. */
function question(requestId = 'req-1'): Record<string, unknown> {
  return {
    v: 1,
    id: `frame-${requestId}`,
    kind: 'request',
    type: 'permission.requested',
    ts: AT,
    sessionId: SESSION,
    payload: {
      requestId,
      toolUseId: `toolu-${requestId}`,
      toolName: 'Bash',
      title: 'permission.tool.Bash',
      description: 'rm -rf build',
      input: { command: 'rm -rf build' },
      riskHint: 'write',
      defaultToNo: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      suggestions: [{ scope: 'once', labelKey: 'permission.scope.once' }],
    },
  };
}

describe('a new conversation is a draft — plan 08, B-33, D-07', () => {
  it('teaches the first conversation, and runs nothing until the first prompt — S-151, S-196', async () => {
    await onWorkbench();

    const aside = claudeAside();
    expect(within(aside).getByText(t('sessions.draft.title'))).toBeVisible();
    expect(within(aside).getByText(t('sessions.draft.mention'))).toBeVisible();
    expect(within(aside).getByText(t('sessions.draft.commands'))).toBeVisible();
    expect(within(aside).getByText(t('sessions.draft.drag'))).toBeVisible();
    expect(within(aside).getByText(/Ctrl\+Alt\+L/)).toBeVisible();
    expect(starts()).toEqual([]);
  });

  it('offers only the installation’s default before any session of the folder ran — S-172', async () => {
    await onWorkbench();

    expect(
      within(claudeAside()).getByRole('button', {
        name: `${t('sessions.model.label')}: ${t('sessions.model.default')}`,
      }),
    ).toBeDisabled();
    expect(within(claudeAside()).getByText(t('sessions.draft.defaultModel'))).toBeVisible();
    expect(
      within(claudeAside()).queryByRole('button', { name: new RegExp(t('sessions.effort.label')) }),
    ).toBeNull();
  });

  it('opens the session with what was chosen, then sends the prompt — S-152, S-171', async () => {
    const user = userEvent.setup();
    rememberModels(A, [OPUS, HAIKU]);
    await onWorkbench();

    await choose(user, `${t('sessions.model.label')}: ${t('sessions.model.default')}`, /^Opus/);
    within(claudeAside())
      .getByRole('button', {
        name: `${t('sessions.effort.label')}: ${t('sessions.effort.default')}`,
      })
      .focus();
    await user.keyboard('{Enter}');
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      t('sessions.effort.default'),
      t('sessions.effort.low'),
      t('sessions.effort.high'),
    ]);
    await user.click(screen.getByRole('menuitem', { name: t('sessions.effort.high') }));
    await choose(
      user,
      `${t('sessions.mode.label')}: ${t('sessions.mode.default')}`,
      new RegExp(t('sessions.mode.plan')),
    );

    await startFromDraft(user, live, { id: SESSION, folder: A, text: 'plan the work' });

    expect(starts()).toHaveLength(1);
    expect(live.lastSent('session.start')).toMatchObject({
      payload: { workspacePath: A, model: 'opus', permissionMode: 'plan', effort: 'high' },
    });
    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { sessionId: SESSION, text: 'plan the work' },
    });
  });

  it('takes no effort for a model that has none — S-171', async () => {
    const user = userEvent.setup();
    rememberModels(A, [OPUS, HAIKU]);
    await onWorkbench();

    await choose(user, `${t('sessions.model.label')}: ${t('sessions.model.default')}`, /^Haiku/);

    expect(
      within(claudeAside()).queryByRole('button', { name: new RegExp(t('sessions.effort.label')) }),
    ).toBeNull();
  });

  it('keeps the prompt and the choices when the machine is at its ceiling — S-153', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await choose(
      user,
      `${t('sessions.mode.label')}: ${t('sessions.mode.default')}`,
      new RegExp(t('sessions.mode.plan')),
    );

    await typeIn(user, within(claudeAside()).getByLabelText(t('session.composer.label')), 'go');
    await user.click(
      within(claudeAside()).getByRole('button', { name: t('session.composer.send') }),
    );
    expect(
      within(claudeAside()).getByRole('button', { name: t('sessions.draft.starting') }),
    ).toBeDisabled();
    live.receive(
      aRefusal(
        String(live.lastSent('session.start')?.['id']),
        'SESSION_LIMIT_REACHED',
        'session.error.limitReached',
        {
          limit: 10,
        },
      ),
    );

    expect(
      await within(claudeAside()).findByText(t('session.error.limitReached', { limit: 10 })),
    ).toBeVisible();
    expect(within(claudeAside()).getByLabelText(t('session.composer.label'))).toHaveValue('go');
    expect(
      within(claudeAside()).getByRole('button', {
        name: `${t('sessions.mode.label')}: ${t('sessions.mode.plan')}`,
      }),
    ).toBeVisible();

    // Sent again as it was — one start per send, nothing retried behind the person's back.
    await user.click(
      within(claudeAside()).getByRole('button', { name: t('session.composer.send') }),
    );
    expect(starts()).toHaveLength(2);
    expect(live.lastSent('session.start')).toMatchObject({ payload: { permissionMode: 'plan' } });
  });

  it('opens one session however often it is sent before the answer — S-154', async () => {
    const user = userEvent.setup();
    await onWorkbench();

    await typeIn(user, within(claudeAside()).getByLabelText(t('session.composer.label')), 'once');
    await user.click(
      within(claudeAside()).getByRole('button', { name: t('session.composer.send') }),
    );
    await typeIn(user, within(claudeAside()).getByLabelText(t('session.composer.label')), 'twice');
    fireEvent.submit(
      within(claudeAside()).getByLabelText(t('session.composer.label')).closest('form')!,
    );

    expect(starts()).toHaveLength(1);
    live.receive(startedFrame(live.lastSent('session.start')?.['id'], SESSION, A));
    await within(claudeAside()).findByText(
      t('session.screen.sessionLabel', { sessionId: SESSION }),
    );
    expect(live.sent().filter((frame) => frame['type'] === 'session.prompt')).toHaveLength(1);
  });

  it('leaves nothing in the backend when a draft is closed — S-155', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await user.click(within(claudeAside()).getByRole('button', { name: t('sessions.tabs.new') }));
    expect(panelTabs()).toHaveLength(2);
    const sentBefore = live.sent().length;

    await user.click(
      within(panelTabs()[1]!).getByRole('button', { name: t('sessions.tabs.closeTab') }),
    );

    expect(panelTabs()).toHaveLength(1);
    expect(live.sent()).toHaveLength(sentBefore);
  });
});

describe('the conversations of a folder tab, in tabs — plan 08, B-32', () => {
  it('opens, switches, reorders and closes them — and closing never ends a session — S-150', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A, text: 'name of the tab' });
    // What was first asked names the tab, as the session tells it.
    live.receive(
      hubEvent(SESSION, 'message.completed', 2, {
        messageId: 'u1',
        role: 'user',
        content: [{ type: 'text', text: 'name of the tab' }],
      }),
    );

    await user.click(within(claudeAside()).getByRole('button', { name: t('sessions.tabs.new') }));
    expect(panelTabs().map((tab) => tab.textContent)).toEqual([
      'name of the tab',
      t('sessions.tabs.draft'),
    ]);
    await draftOnScreen();

    fireEvent.contextMenu(
      within(panelTabs()[1]!).getByRole('button', { name: t('sessions.tabs.draft') }),
    );
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.tabs.moveLeft') }));
    expect(panelTabs().map((tab) => tab.textContent)).toEqual([
      t('sessions.tabs.draft'),
      'name of the tab',
    ]);

    await user.click(within(panelTabs()[1]!).getByRole('button', { name: 'name of the tab' }));
    expect(
      await within(claudeAside()).findByText(
        t('session.screen.sessionLabel', { sessionId: SESSION }),
      ),
    ).toBeVisible();

    fireEvent.contextMenu(
      within(panelTabs()[0]!).getByRole('button', { name: t('sessions.tabs.draft') }),
    );
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.tabs.moveRight') }));
    expect(panelTabs().map((tab) => tab.textContent)).toEqual([
      'name of the tab',
      t('sessions.tabs.draft'),
    ]);

    // The chat and the changes of the session, a press apart.
    await user.click(
      within(claudeAside()).getByRole('button', { name: t('workbench.claude.showChanges') }),
    );
    expect(
      await within(claudeAside()).findByRole('region', { name: t('sessions.changes.title') }),
    ).toBeVisible();
    await user.click(
      within(claudeAside()).getByRole('button', { name: t('workbench.claude.showChat') }),
    );
    expect(
      await within(claudeAside()).findByText(
        t('session.screen.sessionLabel', { sessionId: SESSION }),
      ),
    ).toBeVisible();

    fireEvent.contextMenu(within(panelTabs()[0]!).getByRole('button', { name: 'name of the tab' }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.tabs.close') }));
    expect(panelTabs()).toHaveLength(1);
    await draftOnScreen();
    expect(live.lastSent('session.close')).toBeUndefined();
  });

  it('keeps each folder tab’s drafts to itself, and gives them back — S-146, S-147', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await typeIn(user, within(claudeAside()).getByLabelText(t('session.composer.label')), 'for a');

    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(within(claudeAside()).getByLabelText(t('session.composer.label'))).toHaveValue('');
    });

    await user.click(await tabNamed('a'));
    await waitFor(() => {
      expect(within(claudeAside()).getByLabelText(t('session.composer.label'))).toHaveValue(
        'for a',
      );
    });
  });

  it('attaches a session once, shown in two folder tabs — S-148', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A });
    const attaches = () => live.sent().filter((frame) => frame['type'] === 'session.attach').length;
    const before = attaches();

    act(() => {
      claudePanelStore(B).getState().show('session', SESSION);
      folderTabStore(B).getState().showSession(SESSION);
    });
    await user.click(await tabNamed('b'));
    expect(
      await within(claudeAside()).findByText(
        t('session.screen.sessionLabel', { sessionId: SESSION }),
      ),
    ).toBeVisible();

    expect(attaches()).toBe(before);
  });
});

describe('the keys of the panel — plan 08, B-40, S-185', () => {
  it('opens a new conversation, steps between them and shows the changes — focus anywhere', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A, text: 'first' });

    press('n', 'KeyN');
    await waitFor(() => {
      expect(panelTabs()).toHaveLength(2);
    });
    await draftOnScreen();

    press(']', 'BracketRight');
    expect(
      await within(claudeAside()).findByText(
        t('session.screen.sessionLabel', { sessionId: SESSION }),
      ),
    ).toBeVisible();

    press('i', 'KeyI');
    expect(live.lastSent('session.interrupt')).toMatchObject({ payload: { sessionId: SESSION } });

    press('g', 'KeyG');
    expect(
      await within(claudeAside()).findByRole('button', {
        name: t('workbench.claude.showChanges'),
        pressed: true,
      }),
    ).toBeVisible();

    press('[', 'BracketLeft');
    await draftOnScreen();
  });

  it('hides and shows the panel, from its button and its key — S-145', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    const toggle = screen.getByRole('button', { name: t('workbench.layout.secondary') });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: t('workbench.claude.label') })).toBeNull();
    });

    press('b', 'KeyB');
    expect(
      await screen.findByRole('complementary', { name: t('workbench.claude.label') }),
    ).toBeVisible();

    // The prompt box, from anywhere: the panel opens if it is not.
    await user.click(toggle);
    press('l', 'KeyL');
    expect(
      await screen.findByRole('complementary', { name: t('workbench.claude.label') }),
    ).toBeVisible();
  });
});

describe('the session on screen, in the status bar — plan 08, B-41', () => {
  const item = () => screen.queryByRole('button', { name: /^Claude: .* — open the panel$/ });

  it('is not there without a conversation, then says how the session stands — S-186, S-187', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    expect(item()).toBeNull();

    await startFromDraft(user, live, { id: SESSION, folder: A });
    // What the attach replays of it, as the hub keeps it.
    live.receive(
      hubEvent(SESSION, 'session.started', 1, {
        sessionId: SESSION,
        workspacePath: A,
        model: 'claude-sonnet-5',
        permissionMode: 'default',
      }),
    );

    await waitFor(() => {
      expect(item()?.getAttribute('aria-label')).toBe(
        t('sessions.status.item', {
          status: t('session.status.idle'),
          model: 'claude-sonnet-5',
          cost: '$0.00',
        }),
      );
    });

    // Pressed with the panel closed, it opens it.
    await user.click(screen.getByRole('button', { name: t('workbench.layout.secondary') }));
    await user.click(item()!);
    expect(folderTabStore(A).getState().secondaryOpen).toBe(true);
  });
});

describe('questions asked where nobody is looking — plan 08, B-42', () => {
  it('counts them on the tab of their folder and says so, with the way to them — S-189, S-190', async () => {
    const user = userEvent.setup();
    const told: AppNotification[] = [];
    const stop = onNotify((notification) => told.push(notification));
    const mounted = await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A });

    await user.click(await tabNamed('b'));
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: B });
    });
    live.receive(question());

    const badge = await within(await tabNamed(/^a/)).findByRole('status', {
      name: t('sessions.badge.label', { count: 1 }),
    });
    expect(badge).toHaveTextContent('1');
    expect(told.at(-1)).toMatchObject({
      messageKey: 'notification.permission.waiting',
      params: { folder: 'a' },
    });
    // Never the command: the notice shows on every screen.
    expect(JSON.stringify(told)).not.toContain('rm -rf');

    act(() => {
      told.at(-1)?.actions?.[0]?.run();
    });
    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ folder: A });
    });
    expect(await within(claudeAside()).findByRole('listitem', { name: /Bash/ })).toBeVisible();

    // Answered on another device: the count goes.
    live.receive({
      v: 1,
      id: 'resolved-1',
      kind: 'event',
      type: 'permission.resolved',
      ts: AT,
      sessionId: SESSION,
      seq: 5,
      payload: { requestId: 'req-1', decision: 'allow', resolvedBy: 'mobile' },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('status', { name: t('sessions.badge.label', { count: 1 }) }),
      ).toBeNull();
    });
    stop();
  });

  it('marks the activity bar and says it aloud when the panel is closed — S-188', async () => {
    const user = userEvent.setup();
    await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A });
    await user.click(screen.getByRole('button', { name: t('workbench.layout.secondary') }));

    live.receive(question());

    const bar = screen.getByRole('toolbar', { name: t('workbench.activityBar.label') });
    expect(
      await within(bar).findByLabelText(t('sessions.badge.label', { count: 1 })),
    ).toBeVisible();
    expect(
      within(bar).getByText(t('sessions.badge.announce', { folder: 'a' })),
    ).toBeInTheDocument();
  });
});

describe('the notifications of the browser — plan 08, B-42, D-21', () => {
  /** The browser's `Notification`, answering `answer` when asked, recording what it showed. */
  function browserAnswering(answer: NotificationPermission) {
    const shown: string[] = [];
    const Fake = Object.assign(
      function Notification(this: unknown, title: string) {
        shown.push(title);
      },
      {
        permission: 'default' as NotificationPermission,
        requestPermission: vi.fn(() => {
          Fake.permission = answer;
          return Promise.resolve(answer);
        }),
      },
    );
    vi.stubGlobal('Notification', Fake);
    return { shown, Fake };
  }

  function hidden(page: boolean): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (page ? 'hidden' : 'visible'),
    });
  }

  afterEach(() => {
    hidden(false);
  });

  it('asks only when turned on, and tells only with the page hidden, never the command — S-192', async () => {
    const user = userEvent.setup();
    const browser = browserAnswering('granted');
    await onWorkbench();
    await startFromDraft(user, live, { id: SESSION, folder: A });
    expect(browser.Fake.requestPermission).not.toHaveBeenCalled();

    await user.click(
      within(claudeAside()).getByRole('button', { name: t('sessions.browserNotice.turnOn') }),
    );
    expect(browser.Fake.requestPermission).toHaveBeenCalledTimes(1);
    expect(
      await within(claudeAside()).findByRole('button', {
        name: t('sessions.browserNotice.turnOff'),
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    live.receive(question());
    expect(browser.shown).toEqual([]);

    hidden(true);
    live.receive(question('req-2'));
    live.receive(
      hubEvent(SESSION, 'turn.completed', 9, { turnId: 't1', costUsd: '0.01', durationMs: 5 }),
    );

    expect(browser.shown).toEqual([
      t('sessions.browserNotice.permission', { folder: 'a' }),
      t('sessions.browserNotice.turn', { folder: 'a' }),
    ]);
    expect(browser.shown.join()).not.toContain('rm -rf');

    await user.click(
      within(claudeAside()).getByRole('button', { name: t('sessions.browserNotice.turnOff') }),
    );
    live.receive(question('req-3'));
    expect(browser.shown).toHaveLength(2);
  });

  it('says how to allow them again when the browser refused, the badges going on — S-193', async () => {
    const user = userEvent.setup();
    browserAnswering('denied');
    await onWorkbench();

    await user.click(
      within(claudeAside()).getByRole('button', { name: t('sessions.browserNotice.turnOn') }),
    );

    expect(
      await within(claudeAside()).findByText(t('sessions.browserNotice.denied')),
    ).toBeVisible();
  });

  it('cannot be turned on where the browser has none', async () => {
    vi.stubGlobal('Notification', undefined);
    await onWorkbench();

    expect(
      within(claudeAside()).getByRole('button', { name: t('sessions.browserNotice.turnOn') }),
    ).toBeDisabled();
  });
});

describe('the help and the accessibility of the panel — plan 08, B-43', () => {
  it('explains the modes, the queue, sending again, rejecting and what is not recorded — S-194', async () => {
    const user = userEvent.setup();
    await onWorkbench();

    await user.click(
      within(claudeAside()).getByRole('button', { name: t('claudePanel.help.open') }),
    );

    const help = await screen.findByRole('dialog');
    for (const topic of ['modes', 'queue', 'resend', 'review', 'context', 'notices']) {
      expect(within(help).getByText(t(`claudePanel.help.${topic}Heading`))).toBeVisible();
    }
    expect(within(help).getByText(t('claudePanel.help.notRecorded'))).toBeVisible();
  });

  it('has no accessibility violation, with a draft and with a session — S-195', async () => {
    const user = userEvent.setup();
    const { container } = await onWorkbench();
    expect(await axe(container)).toHaveNoViolations();

    await startFromDraft(user, live, { id: SESSION, folder: A });
    expect(await axe(container)).toHaveNoViolations();
  });
});
