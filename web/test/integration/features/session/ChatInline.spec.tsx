import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { useEditAndResend } from '@/features/session/hooks/useEditAndResend';
import { useSetPermissionMode } from '@/features/session/hooks/useSetPermissionMode';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { typeIn } from '../../../support/workbench';
import {
  aCheckpointDto,
  aRefusal,
  aRewoundPayload,
  routeApi,
  SESSION,
} from '../../../support/session-tools';

const t = translator('en');
const NOW = new Date('2026-10-03T12:00:00.000Z');
const FOLDER = '/srv/app';
const CHECKPOINTS = `/sessions/${SESSION}/checkpoints`;
const CHANGES = 'the changes';

let live: LiveSocket;
let seq = 1;

beforeEach(() => {
  forgetLiveSessions();
  live = aLiveSocket();
  seq = 1;
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The screen as the panel hosts it: editing prompts, approving plans into the mode of the bar. */
function Hosted({
  changes = false,
  onShowChat,
}: {
  readonly changes?: boolean;
  readonly onShowChat?: () => void;
}): React.JSX.Element {
  const edit = useEditAndResend(FOLDER, SESSION);
  const setMode = useSetPermissionMode(SESSION);

  return (
    <SessionScreen
      sessionId={SESSION}
      edit={edit}
      onPlanApproved={setMode}
      onShowChat={onShowChat}
      changes={changes ? <p>{CHANGES}</p> : undefined}
    />
  );
}

/** What the session says next, numbered after what it said before. */
function says(type: string, payload: Record<string, unknown>, ts = NOW.toISOString()): void {
  seq += 1;
  live.receive({ ...hubEvent(SESSION, type, seq, payload), ts });
}

/** A question, as the server asks it: a `request` frame, with no sequence. */
function asks(overrides: Record<string, unknown> = {}): void {
  const requestId = typeof overrides['requestId'] === 'string' ? overrides['requestId'] : 'req-1';

  live.receive({
    v: 1,
    id: `frame-${requestId}`,
    kind: 'request',
    type: 'permission.requested',
    ts: NOW.toISOString(),
    sessionId: SESSION,
    payload: {
      requestId,
      toolUseId: 't1',
      toolName: 'Bash',
      title: 'permission.tool.Bash',
      description: 'rm -rf build/ && pnpm build --filter ./web --mode production',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      defaultToNo: true,
      // From the clock of the test — the real one, unless the case froze it.
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      suggestions: [
        { scope: 'once', labelKey: 'permission.scope.once' },
        {
          scope: 'project',
          labelKey: 'permission.scope.project',
          pattern: 'Bash(rm -rf build/)',
          lifetimeMs: 7 * 24 * 60 * 60 * 1000,
        },
      ],
      ...overrides,
    },
  });
}

/** How the server settles a request. */
function resolves(requestId: string, payload: Record<string, unknown>): void {
  says('permission.resolved', { requestId, ...payload });
}

/** The screen of a live session, connected. */
function opened(element: React.JSX.Element = <Hosted />): ReturnType<typeof render> {
  const mounted = render(element);
  live.connect();
  says('session.started', {
    sessionId: SESSION,
    claudeSessionId: 'conv-1',
    workspacePath: FOLDER,
    model: 'claude-opus-5',
    permissionMode: 'default',
  });
  return mounted;
}

const conversation = (): HTMLElement =>
  screen.getByRole('list', { name: t('session.screen.conversation') });
const toolStarted = (toolUseId: string, toolName = 'Bash', input: Record<string, unknown> = {}) => {
  says('tool.started', { toolUseId, toolName, input: { command: 'rm -rf build/', ...input } });
};
const cardOfBash = (): HTMLElement =>
  screen.getByRole('listitem', { name: t('permission.card.label', { tool: 'Bash' }) });
const answers = (): Record<string, unknown>[] =>
  live.sent().filter((frame) => frame['type'] === 'permission.resolve');
const indicator = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-working-indicator]');

describe('the line of a turn that runs — plan 09, B-21', () => {
  it('is the last line of the conversation while the turn runs, and gives way to its summary — S-48, S-50', () => {
    opened();
    says('message.completed', {
      messageId: 'u1',
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    });

    says('session.statusChanged', { status: 'thinking' });

    const line = indicator();
    expect(line).not.toBeNull();
    expect(line?.parentElement?.lastElementChild).toBe(line);
    expect(line?.closest('[data-chat-scroller]')).not.toBeNull();

    says('turn.completed', { turnId: 'turn-1', costUsd: '0.01', durationMs: 4000 });
    says('session.statusChanged', { status: 'idle' });

    expect(indicator()).toBeNull();
    expect(within(conversation()).getByText(/Turn/)).toBeInTheDocument();
  });

  it('goes for a turn interrupted or failed too — S-50', () => {
    opened();
    says('session.statusChanged', { status: 'running' });
    expect(indicator()).not.toBeNull();

    says('session.closed', { reason: 'failed' });

    expect(indicator()).toBeNull();
  });

  it('says which tool runs, then that it waits on you — and takes you to the card — S-49', async () => {
    const user = userEvent.setup();
    opened();
    says('session.statusChanged', { status: 'running' });
    toolStarted('t1');

    expect(within(indicator() as HTMLElement).getByRole('status')).toHaveTextContent(
      t('sessions.working.runningTool', { tool: 'Bash' }),
    );

    asks();
    says('session.statusChanged', { status: 'waitingPermission' });

    const waiting = within(indicator() as HTMLElement).getByRole('button', {
      name: t('sessions.working.waiting'),
    });
    await user.click(waiting);

    await waitFor(() => {
      expect(document.activeElement).toBe(cardOfBash());
    });
  });
});

describe('thinking, in the order of the conversation — plan 09, B-22', () => {
  it('is alive while it arrives, and says how long it took once it ends — S-54', async () => {
    const user = userEvent.setup();
    opened();

    says(
      'message.delta',
      { messageId: 'm1', delta: 'Let me see', blockType: 'thinking' },
      '2026-10-03T12:00:00.000Z',
    );

    const alive = screen.getByText(t('sessions.thinking.live'));
    expect(alive.closest('summary')?.querySelector('svg')).toHaveClass('motion-safe:animate-pulse');

    says(
      'message.completed',
      {
        messageId: 'm1',
        role: 'assistant',
        content: [{ type: 'thinking', thinking: 'Let me see' }],
      },
      '2026-10-03T12:00:03.000Z',
    );

    // Summarised, it stays in view (plan 22, D-15) — and folds at a click.
    const took = screen.getByText(t('sessions.thinking.took', { seconds: 3 }));
    expect(screen.getByText('Let me see')).toBeVisible();
    await user.click(took);
    expect(took.closest('details')).not.toHaveAttribute('open');
  });

  it('draws three thinkings between two tools as five lines, in the order they came — S-55', () => {
    opened();
    const thinking = (messageId: string, text: string): void => {
      says('message.completed', {
        messageId,
        role: 'assistant',
        content: [{ type: 'thinking', thinking: text }],
      });
    };

    toolStarted('t1');
    thinking('m1', 'first');
    thinking('m2', 'second');
    thinking('m3', 'third');
    toolStarted('t2');

    const lines = within(conversation())
      .getAllByRole('listitem')
      .map((item) => (item.querySelector('details') === null ? 'tool' : 'thinking'));
    expect(lines).toEqual(['tool', 'thinking', 'thinking', 'thinking', 'tool']);
  });

  it('says a redacted thinking existed, and invents nothing — S-56', () => {
    opened();
    says('message.completed', {
      messageId: 'm1',
      role: 'assistant',
      content: [{ type: 'redacted_thinking', data: 'opaque' }],
    });

    expect(screen.getByText(t('sessions.thinking.hidden'))).toBeInTheDocument();
    expect(screen.queryByText('opaque')).toBeNull();
  });
});

describe('the question, in the place of its tool — plan 09, B-23, B-24', () => {
  it('stands whole where the line of the tool was — S-58, S-60', async () => {
    const user = userEvent.setup();
    opened();
    toolStarted('t1');

    asks();

    const card = within(conversation()).getByRole('listitem', {
      name: t('permission.card.label', { tool: 'Bash' }),
    });
    expect(
      screen.queryByRole('button', { name: new RegExp(t('sessions.tool.bash', { command: '' })) }),
    ).toBeNull();
    // The command exact and whole, the risk, the countdown, the scopes, the second step.
    expect(
      within(card).getByText('rm -rf build/ && pnpm build --filter ./web --mode production'),
    ).toBeInTheDocument();
    expect(within(card).getByText(t('permission.risk.destructive'))).toBeInTheDocument();
    expect(within(card).getByRole('timer')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: t('permission.scope.project') }));
    expect(within(card).getByText('Bash(rm -rf build/)')).toBeInTheDocument();
  });

  it('waits at the end when it comes before the line of its tool, and moves to it once it arrives — S-59', () => {
    opened();
    asks({ toolUseId: 't2' });

    const tail = screen.getByRole('list', { name: t('sessions.inline.tail') });
    expect(within(tail).getByRole('listitem')).toBe(cardOfBash());

    toolStarted('t2');

    expect(screen.queryByRole('list', { name: t('sessions.inline.tail') })).toBeNull();
    expect(
      screen.getAllByRole('listitem', { name: t('permission.card.label', { tool: 'Bash' }) }),
    ).toHaveLength(1);
    expect(within(conversation()).getByRole('listitem', { name: /Bash/ })).toBe(cardOfBash());
  });

  it('keeps the question of a subagent’s tool in view at the end, never folded under its tool', () => {
    opened();
    says('tool.started', { toolUseId: 'a1', toolName: 'Agent', input: { description: 'look' } });
    says('tool.started', {
      toolUseId: 't9',
      toolName: 'Bash',
      input: { command: 'ls' },
      parentToolUseId: 'a1',
    });

    asks({ toolUseId: 't9' });

    expect(
      within(screen.getByRole('list', { name: t('sessions.inline.tail') })).getByRole('listitem'),
    ).toBe(cardOfBash());
  });

  it('becomes the line of its tool, saying nobody answered in time — and a late answer is refused, translated — S-61', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    opened();
    toolStarted('t1');
    asks({ expiresAt: new Date(NOW.getTime() + 1_000).toISOString(), suggestions: [] });
    await user.click(within(cardOfBash()).getByRole('button', { name: t('permission.card.deny') }));
    const answerId = answers()[0]?.['id'];

    live.receive(
      aRefusal(String(answerId), 'PERMISSION_REQUEST_EXPIRED', 'permission.error.requestExpired'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(t('permission.error.requestExpired'));

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.queryByRole('timer')).toBeNull();
    expect(within(conversation()).getByText(t('permission.outcome.expired'))).toBeInTheDocument();
    expect(within(conversation()).getByRole('button', { name: /Bash/ })).toBeInTheDocument();
  });

  it('becomes the line of its tool with who answered on a phone, rather than vanishing — S-62', () => {
    opened();
    toolStarted('t1');
    asks();

    resolves('req-1', {
      decision: 'allow',
      auto: false,
      resolvedBy: 'Ana',
      resolvedFrom: 'mobile',
    });

    expect(screen.queryByRole('listitem', { name: /Permission/ })).toBeNull();
    expect(
      within(conversation()).getByText(
        t('permission.outcome.onPhone', { decision: t('permission.verdict.allow'), who: 'Ana' }),
      ),
    ).toBeInTheDocument();
  });

  it('draws on no tool a request a rule settled before anybody was asked', () => {
    opened();
    toolStarted('t1');

    resolves('req-9', { decision: 'allow', auto: true });

    expect(within(conversation()).queryByText(t('permission.outcome.rule'))).toBeNull();
    expect(within(conversation()).getByRole('button', { name: /Bash/ })).toBeInTheDocument();
  });

  it('says it was you who answered, from this screen', async () => {
    const user = userEvent.setup();
    opened();
    toolStarted('t1');
    asks();

    await user.click(
      within(cardOfBash()).getByRole('button', { name: t('permission.scope.once') }),
    );
    resolves('req-1', { decision: 'allow', auto: false, resolvedBy: 'me', resolvedFrom: 'web' });

    expect(
      within(conversation()).getByText(
        t('permission.outcome.byYou', { decision: t('permission.verdict.allow') }),
      ),
    ).toBeInTheDocument();
  });

  it('draws two questions in parallel each in the place of its tool, answered apart — S-63, S-64', async () => {
    const user = userEvent.setup();
    opened();
    toolStarted('t1');
    says('tool.started', {
      toolUseId: 't2',
      toolName: 'Write',
      input: { file_path: '/srv/app/a.txt', content: 'a' },
    });
    asks();
    asks({
      requestId: 'req-2',
      toolUseId: 't2',
      toolName: 'Write',
      title: 'permission.tool.Write',
      description: '/srv/app/a.txt',
      riskHint: 'write',
      defaultToNo: false,
    });

    const items = within(conversation()).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-permission-request'))).toEqual([
      'req-1',
      'req-2',
    ]);

    const once = within(cardOfBash()).getByRole('button', { name: t('permission.scope.once') });
    await user.dblClick(once);

    expect(answers()).toHaveLength(1);
    expect(answers()[0]).toMatchObject({ payload: { requestId: 'req-1', decision: 'allow' } });
    const write = screen.getByRole('listitem', {
      name: t('permission.card.label', { tool: 'Write' }),
    });
    expect(within(write).getByRole('button', { name: t('permission.scope.once') })).toBeEnabled();
  });

  it('takes no room without a question: no "Waiting for you", no "Nothing to decide" — S-65', () => {
    opened();
    toolStarted('t1');

    expect(screen.queryByText('Waiting for you')).toBeNull();
    expect(screen.queryByText('Nothing to decide')).toBeNull();
    expect(
      screen.queryByRole('button', { name: t('sessions.pending.pill', { count: 1 }) }),
    ).toBeNull();
  });

  it('puts the plan to approve in the place of ExitPlanMode, and approving it moves the mode of the bar — S-66', async () => {
    const user = userEvent.setup();
    opened();
    says('tool.started', { toolUseId: 't3', toolName: 'ExitPlanMode', input: { plan: '# Plan' } });
    asks({
      toolUseId: 't3',
      toolName: 'ExitPlanMode',
      title: 'permission.tool.ExitPlanMode',
      input: { plan: '# Plan' },
      riskHint: 'read',
      defaultToNo: false,
    });

    const plan = within(conversation()).getByRole('listitem', { name: t('permission.plan.label') });
    await user.click(
      within(plan).getByRole('radio', { name: t('permission.planMode.acceptEdits') }),
    );
    await user.click(within(plan).getByRole('button', { name: t('permission.plan.approve') }));

    expect(
      screen.getByRole('button', {
        name: t('composer.chip.choice', {
          label: t('sessions.mode.label'),
          value: t('sessions.mode.acceptEdits'),
        }),
      }),
    ).toBeInTheDocument();
    expect(live.lastSent('session.setPermissionMode')).toMatchObject({
      payload: { mode: 'acceptEdits' },
    });
  });

  it('has no accessibility violation with a question in the conversation', async () => {
    const { container } = opened();
    toolStarted('t1');
    asks();

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('never out of view, and never taking the focus of who writes — plan 09, B-25', () => {
  it('shows the pill above the box with the card scrolled away, and takes you to it — S-67', async () => {
    const user = userEvent.setup();
    opened();
    toolStarted('t1');
    asks();
    // The card above the scroller: scrolled up and away.
    vi.spyOn(cardOfBash(), 'getBoundingClientRect').mockReturnValue({
      top: -400,
      bottom: -100,
    } as DOMRect);
    const scroller = document.querySelector('[data-chat-scroller]') as HTMLElement;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });

    const pill = await screen.findByRole('button', {
      name: t('sessions.pending.pill', { count: 1 }),
    });
    expect(pill.closest('[data-chat-scroller]')).toBeNull();
    await user.click(pill);

    await waitFor(() => {
      expect(document.activeElement).toBe(cardOfBash());
    });
  });

  it('shows the pill with the changes on screen; pressing it brings the conversation back, on the card — S-68', async () => {
    const user = userEvent.setup();
    function WithChanges(): React.JSX.Element {
      const [changes, setChanges] = useState(true);
      return (
        <Hosted
          changes={changes}
          onShowChat={() => {
            setChanges(false);
          }}
        />
      );
    }
    opened(<WithChanges />);
    toolStarted('t1');
    asks();

    await user.click(
      await screen.findByRole('button', { name: t('sessions.pending.pill', { count: 1 }) }),
    );

    expect(screen.queryByText(CHANGES)).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(cardOfBash());
    });
  });

  it('announces the question, and leaves the focus in the box with text written: Enter sends the prompt — S-69', async () => {
    const user = userEvent.setup();
    opened();
    toolStarted('t1');
    const box = screen.getByLabelText(t('composer.box.label'));
    await typeIn(user, box, 'and then the docs');

    asks();

    expect(document.activeElement).toBe(box);
    expect(
      screen
        .getAllByRole('status')
        .some((each) => each.textContent === t('sessions.pending.pill', { count: 1 })),
    ).toBe(true);
    await user.keyboard('{Enter}');

    expect(live.lastSent('session.prompt')).toMatchObject({
      payload: { text: 'and then the docs' },
    });
    expect(answers()).toHaveLength(0);
  });

  it('gives the refusal the focus when nobody writes and the question leans to no — once — S-70', () => {
    opened();
    toolStarted('t1');
    (document.activeElement as HTMLElement | null)?.blur();

    asks();

    const deny = within(cardOfBash()).getByRole('button', { name: t('permission.card.deny') });
    expect(document.activeElement).toBe(deny);
  });

  it('leaves the focus where it is for a question that does not lean to no', () => {
    opened();
    toolStarted('t1');
    (document.activeElement as HTMLElement | null)?.blur();

    asks({ defaultToNo: false });

    expect(document.activeElement).toBe(document.body);
  });
});

describe('what is done from a prompt — plan 09, B-27', () => {
  function prompted(): void {
    says('message.completed', {
      messageId: 'u1',
      role: 'user',
      content: [{ type: 'text', text: 'refactor the parser' }],
    });
  }

  const actions = (): HTMLElement =>
    screen.getByRole('group', { name: t('sessions.message.actions') });

  it('offers edit, fork and undo to here — on hover and on focus — S-75', async () => {
    const user = userEvent.setup();
    opened();
    prompted();

    expect(actions()).toHaveClass('group-hover:opacity-100', 'group-focus-within:opacity-100');
    expect(
      within(actions()).getByRole('button', { name: t('sessions.message.edit') }),
    ).toBeInTheDocument();
    expect(
      within(actions()).getByRole('button', { name: t('sessions.message.forkFrom') }),
    ).toBeInTheDocument();
    await user.tab();
    const undo = within(actions()).getByRole('button', { name: t('sessions.message.undo') });
    undo.focus();
    expect(actions().closest('li')).toContainElement(document.activeElement as HTMLElement);
  });

  it('undoes from the prompt: the reach file by file first, then a line in the conversation — S-76', async () => {
    const user = userEvent.setup();
    routeApi({
      [CHECKPOINTS]: [
        {
          checkpoints: [
            aCheckpointDto({ promptId: 'prompt-1', label: 'something else' }),
            aCheckpointDto({ promptId: 'prompt-2', label: 'refactor the parser' }),
          ],
        },
      ],
    });
    opened();
    says('session.statusChanged', { status: 'idle' });
    prompted();

    await user.click(within(actions()).getByRole('button', { name: t('sessions.message.undo') }));

    const reach = await screen.findByRole('group', { name: t('undo.confirm.title') });
    expect(within(reach).getByText('/srv/app/a.ts')).toBeInTheDocument();
    await user.click(within(reach).getByRole('button', { name: t('undo.confirm.confirm') }));
    expect(live.lastSent('session.rewindFiles')).toMatchObject({
      payload: { sessionId: SESSION, promptId: 'prompt-2' },
    });

    says('session.rewound', aRewoundPayload());
    // The dialog says it file by file; closed, the conversation keeps it as a line, in its place.
    expect(screen.getByRole('region', { name: t('undo.outcome.title') })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(
      within(conversation()).getByText(
        t('sessions.rewound.summary', { restored: 2, kept: 1, failed: 0 }),
      ),
    ).toBeInTheDocument();
  });

  it('refuses the undo while a turn runs, saying why — and shows the refusal of the backend, translated — S-77', async () => {
    const user = userEvent.setup();
    routeApi({
      [CHECKPOINTS]: [{ checkpoints: [aCheckpointDto({ label: 'refactor the parser' })] }],
    });
    opened();
    prompted();
    says('session.statusChanged', { status: 'running' });

    const busy = within(actions()).getByRole('button', { name: t('sessions.message.undoBusy') });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    await user.click(busy);
    expect(screen.queryByRole('dialog')).toBeNull();

    says('session.statusChanged', { status: 'idle' });
    await user.click(within(actions()).getByRole('button', { name: t('sessions.message.undo') }));
    const reach = await screen.findByRole('group', { name: t('undo.confirm.title') });
    await user.click(within(reach).getByRole('button', { name: t('undo.confirm.confirm') }));
    const sent = live.lastSent('session.rewindFiles');

    live.receive(aRefusal(String(sent?.['id']), 'SESSION_LOCKED', 'session.error.locked'));

    expect(await screen.findByText(t('session.error.locked'))).toBeInTheDocument();
  });

  it('has no undo once the session has ended — S-78', () => {
    opened();
    prompted();
    says('session.closed', { reason: 'completed' });

    expect(within(actions()).queryByRole('button', { name: /files back/ })).toBeNull();
    expect(
      within(actions()).getByRole('button', { name: t('sessions.message.edit') }),
    ).toBeInTheDocument();
  });
});
