import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import {
  forgetPermissionQueues,
  PermissionOutcomeLine,
  PermissionRequestCard,
  usePermissionQueue,
} from '@/features/permission';
import type { PlanMode } from '@/features/permission';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The instant every case starts at, so a countdown is a number and not a race. */
const NOW = new Date('2026-09-19T12:00:00.000Z');

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: NOW.toISOString(),
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** The question, as the server asks it: a `request` frame, with no sequence. */
function requestFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    id: 'frame-1',
    kind: 'request',
    type: 'permission.requested',
    ts: NOW.toISOString(),
    sessionId: SESSION,
    payload: {
      requestId: 'req-1',
      toolUseId: 'toolu-1',
      toolName: 'Bash',
      title: 'permission.tool.Bash',
      description: 'rm -rf build/',
      input: { command: 'rm -rf build/' },
      riskHint: 'destructive',
      defaultToNo: true,
      expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      suggestions: [
        { scope: 'once', labelKey: 'permission.scope.once' },
        { scope: 'session', labelKey: 'permission.scope.session' },
      ],
      ...overrides,
    },
  };
}

/**
 * The requests of a session as the conversation draws them since plan 09 (B-23): each card whole,
 * and the line the last one became — without the card of the queue around them, which is gone.
 */
function Requests({
  sessionId,
  onOpenRules,
  onPlanApproved,
}: {
  readonly sessionId: string;
  readonly onOpenRules?: () => void;
  readonly onPlanApproved?: (mode: PlanMode) => void;
}): React.JSX.Element {
  const queue = usePermissionQueue(sessionId);
  const last = queue.settled.at(-1);

  return (
    <>
      {queue.pending.length > 0 && (
        <ul>
          {queue.pending.map((request) => (
            <PermissionRequestCard
              key={request.requestId}
              request={request}
              remainingMs={queue.remainingMs[request.requestId] ?? 0}
              onAnswer={queue.answer}
              onExtend={queue.extend}
              onOpenRules={onOpenRules}
              onPlanApproved={onPlanApproved}
            />
          ))}
        </ul>
      )}
      {last !== undefined && <PermissionOutcomeLine outcome={last} />}
      {queue.refusal !== null && <p role="alert">{t(queue.refusal.messageKey)}</p>}
    </>
  );
}

/**
 * The queue, through the screen.
 *
 * Every case here is one of the four rules of
 * docs/architecture/web/04-state-and-data.md#a-fila-de-permissão, and each of them closes a way of
 * being wrong that a person would notice: a card answered twice, a card that vanishes without
 * saying why, a countdown that asks for confirmation about something already over.
 */
describe('the permission queue', () => {
  let sockets: InstalledWebSocket;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    forgetPermissionQueues();
    setAccessToken('token-1');
    sockets = installFakeWebSocket();
  });

  afterEach(() => {
    wsClient.close();
    setAccessToken(null);
    vi.useRealTimers();
  });

  function connect(): void {
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
  }

  function ask(overrides: Record<string, unknown> = {}): void {
    act(() => {
      sockets.latest.receive(requestFrame(overrides));
    });
  }

  it('takes no room with nothing to decide — no "Waiting for you", no "Nothing to decide" — plan 09, S-65', () => {
    const { container } = render(<Requests sessionId={SESSION} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Waiting for you')).toBeNull();
    expect(screen.queryByText('Nothing to decide')).toBeNull();
  });

  it('becomes the line of how it was settled — by one of your rules — plan 09, B-23', () => {
    render(<Requests sessionId={SESSION} />);
    connect();

    ask();
    expect(screen.getByRole('listitem', { name: /Bash/ })).toBeInTheDocument();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'allow', auto: true },
      });
    });

    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByText(t('permission.outcome.rule'))).toBeInTheDocument();
  });

  it('puts the exact command on screen, with the risk the backend derived', () => {
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    expect(screen.getByText('rm -rf build/')).toBeInTheDocument();
    expect(screen.getByText(t('permission.risk.destructive'))).toBeInTheDocument();
    expect(screen.getByText(t('permission.tool.Bash'))).toBeInTheDocument();
  });

  it('falls back to a generic label for a tool it has no words for', () => {
    render(<Requests sessionId={SESSION} />);
    connect();
    ask({ toolName: 'McpDoSomething', title: 'permission.tool.McpDoSomething' });

    expect(
      screen.getByText(t('permission.tool.unknown', { tool: 'McpDoSomething' })),
    ).toBeInTheDocument();
  });

  it('answers as a response that names the request it answers', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.scope.once') }));

    const answer = sockets.latest.frames().find((sent) => sent['type'] === 'permission.resolve');

    expect(answer).toMatchObject({
      kind: 'response',
      correlationId: 'frame-1',
      payload: { requestId: 'req-1', decision: 'allow', scope: 'once' },
    });
  });

  it('sends a reason with a refusal, because the contract demands one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.card.deny') }));

    const answer = sockets.latest.frames().find((sent) => sent['type'] === 'permission.resolve');

    expect(answer?.['payload']).toMatchObject({ decision: 'deny', reason: expect.any(String) });
  });

  it('takes no second click while an answer is in flight — S-70', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    const allow = screen.getByRole('button', { name: t('permission.scope.once') });
    await user.click(allow);

    expect(allow).toBeDisabled();
    expect(screen.getByText(t('permission.card.sending'))).toBeInTheDocument();
    expect(
      sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve'),
    ).toHaveLength(1);
  });

  it('lets the card go when the countdown reaches zero, without asking — S-71', () => {
    render(<Requests sessionId={SESSION} />);
    connect();
    ask({ expiresAt: new Date(NOW.getTime() + 1_000).toISOString() });

    expect(screen.getByRole('timer')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    // No dialogue and no confirmation: the deadline has already refused it on the server, and
    // asking about something that is over is asking about nothing.
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText(t('permission.outcome.expired'))).toBeInTheDocument();
  });

  it('drops a card resolved on another device, and says who resolved it — S-72', () => {
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'allow', auto: false, resolvedBy: 'auth|42' },
      });
    });

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        t('permission.outcome.by', { decision: t('permission.verdict.allow'), who: 'auth|42' }),
      ),
    ).toBeInTheDocument();
  });

  it('says when the server decided by itself, rather than leaving a card to vanish', () => {
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-2',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'deny', auto: true },
      });
    });

    expect(screen.getByText(t('permission.outcome.expired'))).toBeInTheDocument();
  });

  it('names nobody rather than a blank when the server said who without saying who', () => {
    // The contract requires `resolvedBy` whenever `auto` is false. A frame that breaks that rule
    // still has to render something rather than the word `undefined`.
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-3',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: { requestId: 'req-1', decision: 'allow', auto: false },
      });
    });

    expect(
      screen.getByText(
        t('permission.outcome.by', {
          decision: t('permission.verdict.allow'),
          who: t('permission.outcome.somebody'),
        }),
      ),
    ).toBeInTheDocument();
  });

  it('asks for more time without choosing the number', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    await user.click(screen.getByRole('button', { name: t('permission.card.extend') }));

    // The increment and the ceiling are the backend's: our timeout is the only protection against
    // a hung session, and a client that could choose that number could switch it off.
    expect(
      sockets.latest.frames().find((sent) => sent['type'] === 'permission.extend'),
    ).toMatchObject({ payload: { requestId: 'req-1' } });
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<Requests sessionId={SESSION} />);
    connect();
    ask();

    await waitFor(async () => {
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('a yes that outlives the session — plan 03, B-08', () => {
    const LIFETIME_DAYS = 90;

    /** The question with the two persisted scopes offered, the way the backend offers them. */
    function askPersisted(): void {
      const rule = { pattern: 'Bash(git status)', lifetimeMs: LIFETIME_DAYS * 86_400_000 };
      ask({
        description: 'git status',
        input: { command: 'git status' },
        riskHint: 'read',
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'session', labelKey: 'permission.scope.session' },
          { scope: 'project', labelKey: 'permission.scope.project', ...rule },
          { scope: 'always', labelKey: 'permission.scope.always', ...rule },
        ],
      });
    }

    function answers(): readonly Record<string, unknown>[] {
      return sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');
    }

    it('says in full what `always` reaches, and for how long, before sending anything — S-17', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));

      const step = screen.getByRole('group', { name: t('permission.persist.title') });
      const duration = t('permission.persist.days', { days: LIFETIME_DAYS });
      expect(
        within(step).getByText(t('permission.persist.always', { duration })),
      ).toBeInTheDocument();
      // The pattern exactly as it will be stored — the reach, with no euphemism in between.
      expect(within(step).getByText('Bash(git status)')).toBeInTheDocument();
      expect(within(step).getByText(t('permission.persist.revocable'))).toBeInTheDocument();
      expect(answers()).toHaveLength(0);
    });

    it('asks the second step on a tool that is not destructive, too — S-65', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.project') }));

      const step = screen.getByRole('group', { name: t('permission.persist.title') });
      expect(
        within(step).getByText(
          t('permission.persist.project', {
            duration: t('permission.persist.days', { days: LIFETIME_DAYS }),
          }),
        ),
      ).toBeInTheDocument();
      // The way back has the focus: the accident this step exists for is one stray Enter.
      expect(
        within(step).getByRole('button', { name: t('permission.persist.back') }),
      ).toHaveFocus();

      await user.click(within(step).getByRole('button', { name: t('permission.persist.confirm') }));

      expect(answers()).toEqual([
        expect.objectContaining({
          payload: { requestId: 'req-1', decision: 'allow', scope: 'project', reach: 'exact' },
        }),
      ]);
    });

    it('sends nothing when the person goes back — S-65', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));
      await user.click(screen.getByRole('button', { name: t('permission.persist.back') }));

      expect(answers()).toHaveLength(0);
      // Back where it started, every answer on offer again.
      expect(screen.getByRole('button', { name: t('permission.scope.once') })).toBeEnabled();
    });

    it('leads to the rules from the second step — one of the two ways in of D-04', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const openRules = vi.fn();
      render(<Requests sessionId={SESSION} onOpenRules={openRules} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));
      await user.click(screen.getByRole('button', { name: t('permission.persist.openRules') }));

      expect(openRules).toHaveBeenCalledOnce();
    });

    it('offers no way to the rules when there is nowhere to go', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));

      expect(
        screen.queryByRole('button', { name: t('permission.persist.openRules') }),
      ).not.toBeInTheDocument();
    });

    it('says a lifetime shorter than a day in hours, not as zero days', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      ask({
        suggestions: [
          {
            scope: 'always',
            labelKey: 'permission.scope.always',
            pattern: 'Bash(rm -rf build/)',
            lifetimeMs: 3_600_000,
          },
        ],
      });

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));

      expect(
        screen.getByText(
          t('permission.persist.always', {
            duration: t('permission.persist.hours', { hours: 1 }),
          }),
        ),
      ).toBeInTheDocument();
    });

    it('has no accessibility violation in the second step', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(<Requests sessionId={SESSION} onOpenRules={vi.fn()} />);
      connect();
      askPersisted();

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));

      await waitFor(async () => {
        expect(await axe(container)).toHaveNoViolations();
      });
    });
  });

  describe('how far a rule reaches — plan 23, B-13', () => {
    const LIFETIME = 90 * 86_400_000;
    const PREFIX = ['Bash(git push:*)', 'Bash(tail:*)'];
    const EXACT = ['Bash(git push 2>&1 | tail -5)'];

    function askWithReaches(reaches: readonly Record<string, unknown>[]): void {
      ask({
        description: 'git push 2>&1 | tail -5',
        input: { command: 'git push 2>&1 | tail -5' },
        riskHint: 'write',
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'session', labelKey: 'permission.scope.session' },
          { scope: 'always', labelKey: 'permission.scope.always', lifetimeMs: LIFETIME },
        ],
        reaches,
      });
    }

    function answers(): readonly Record<string, unknown>[] {
      return sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');
    }

    const both = [
      { reach: 'exact', patterns: EXACT },
      { reach: 'prefix', patterns: PREFIX },
    ];

    it('shows each reach with its patterns, and starts on the prefix — S-75, S-77', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches(both);

      const reach = screen.getByRole('group', { name: t('permission.reach.label') });
      expect(
        within(reach).getByRole('radio', { name: new RegExp(t('permission.reach.prefix')) }),
      ).toBeChecked();
      expect(
        within(reach).getByRole('radio', { name: new RegExp(t('permission.reach.exact')) }),
      ).not.toBeChecked();
      expect(within(reach).getByText(PREFIX.join(' · '))).toBeInTheDocument();
      expect(within(reach).getByText(EXACT[0] ?? '')).toBeInTheDocument();
    });

    it('shows no choice when there is only one reach — S-76', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches([{ reach: 'exact', patterns: EXACT }]);

      expect(screen.queryByRole('group', { name: t('permission.reach.label') })).toBeNull();
    });

    it('starts on the exact path for a file, and on the tool when it is all there is — S-77, D-09', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask({
        toolName: 'Edit',
        title: 'permission.tool.Edit',
        description: '/a/b.ts',
        input: { file_path: '/a/b.ts' },
        reaches: [
          { reach: 'exact', patterns: ['Edit(/a/b.ts)'] },
          { reach: 'tool', patterns: ['Edit'] },
        ],
      });

      expect(
        screen.getByRole('radio', { name: new RegExp(t('permission.reach.exact')) }),
      ).toBeChecked();
    });

    it('answers the session with the reach chosen, never a pattern — S-78', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches(both);

      await user.click(screen.getByRole('button', { name: t('permission.scope.session') }));

      expect(answers()).toEqual([
        expect.objectContaining({
          payload: { requestId: 'req-1', decision: 'allow', scope: 'session', reach: 'prefix' },
        }),
      ]);
    });

    it('names no reach for a one-off', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches(both);

      await user.click(screen.getByRole('button', { name: t('permission.scope.once') }));

      expect(answers()[0]?.['payload']).toEqual({
        requestId: 'req-1',
        decision: 'allow',
        scope: 'once',
      });
    });

    it('says every pattern of the reach in the second step, and sends the reach — S-79', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches(both);

      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));
      const step = screen.getByRole('group', { name: t('permission.persist.title') });
      expect(
        within(step).getByText(PREFIX.join(' '), {
          normalizer: (text) => text.replace(/\s+/g, ' '),
        }),
      ).toBeInTheDocument();
      expect(answers()).toHaveLength(0);

      await user.click(within(step).getByRole('button', { name: t('permission.persist.confirm') }));
      expect(answers()).toEqual([
        expect.objectContaining({
          payload: { requestId: 'req-1', decision: 'allow', scope: 'always', reach: 'prefix' },
        }),
      ]);
    });

    it('answers with the reach the person switched to', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches(both);

      await user.click(
        screen.getByRole('radio', { name: new RegExp(t('permission.reach.exact')) }),
      );
      await user.click(screen.getByRole('button', { name: t('permission.scope.session') }));

      expect(answers()[0]?.['payload']).toMatchObject({ reach: 'exact' });
    });

    it('does not offer a persisted scope when nothing can be persisted', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      askWithReaches([]);

      expect(screen.queryByRole('button', { name: t('permission.scope.always') })).toBeNull();
      expect(
        screen.getByRole('button', { name: t('permission.scope.session') }),
      ).toBeInTheDocument();
    });

    it('reads a server that sends no reaches as offering the exact pattern — S-80', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      const rule = { pattern: 'Bash(git status)', lifetimeMs: LIFETIME };
      ask({
        description: 'git status',
        input: { command: 'git status' },
        suggestions: [
          { scope: 'once', labelKey: 'permission.scope.once' },
          { scope: 'always', labelKey: 'permission.scope.always', ...rule },
        ],
      });

      expect(screen.queryByRole('group', { name: t('permission.reach.label') })).toBeNull();
      await user.click(screen.getByRole('button', { name: t('permission.scope.always') }));
      expect(
        within(screen.getByRole('group', { name: t('permission.persist.title') })).getByText(
          'Bash(git status)',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('who answered without asking — plan 23, B-14', () => {
    function settle(payload: Record<string, unknown>): void {
      act(() => {
        sockets.latest.receive({
          v: 1,
          id: 'evt-via',
          kind: 'event',
          type: 'permission.resolved',
          ts: NOW.toISOString(),
          sessionId: SESSION,
          seq: 1,
          payload: { requestId: 'req-1', auto: true, ...payload },
        });
      });
    }

    it('says Permitir tudo allowed it — S-81', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask();
      settle({ decision: 'allow', via: 'allowAll' });

      expect(screen.getByText(t('permission.outcome.allowAll'))).toBeInTheDocument();
    });

    it('says a rule refused it, rather than that nobody answered — S-81', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask();
      settle({ decision: 'deny', via: 'rule' });

      expect(screen.getByText(t('permission.outcome.ruleDenied'))).toBeInTheDocument();
    });

    it('reads a `via` it does not know as a rule — S-82', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask();
      settle({ decision: 'allow', via: 'magic' });

      expect(screen.getByText(t('permission.outcome.rule'))).toBeInTheDocument();
    });
  });

  describe('approving a plan — plan 08, B-22', () => {
    const PLAN = '# The plan\n\n1. Read the tests\n2. Fix the clock';

    function askPlan(): void {
      ask({
        toolName: 'ExitPlanMode',
        title: 'permission.tool.ExitPlanMode',
        description: 'plan',
        input: { plan: PLAN, planFilePath: '/home/dev/.claude/plans/p.md' },
        riskHint: 'read',
        defaultToNo: false,
      });
    }

    function answers(): Record<string, unknown>[] {
      return sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');
    }

    it('shows the plan, in markdown, on a card of its own — S-92', async () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      askPlan();

      const card = screen.getByRole('listitem', { name: t('permission.plan.label') });
      expect(await within(card).findByRole('heading', { name: 'The plan' })).toBeInTheDocument();
      expect(within(card).getByText('Fix the clock')).toBeInTheDocument();
      expect(screen.queryByText(t('permission.risk.read'))).not.toBeInTheDocument();
    });

    it('allows it and goes on in the mode chosen — S-93', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onPlanApproved = vi.fn();
      render(<Requests sessionId={SESSION} onPlanApproved={onPlanApproved} />);
      connect();
      askPlan();

      await user.click(screen.getByRole('radio', { name: t('permission.planMode.acceptEdits') }));
      await user.click(screen.getByRole('button', { name: t('permission.plan.approve') }));

      expect(answers()).toHaveLength(1);
      expect(answers()[0]?.['payload']).toMatchObject({ decision: 'allow', scope: 'once' });
      expect(onPlanApproved).toHaveBeenCalledWith('acceptEdits');
    });

    it('goes on asking for each edit unless told otherwise', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onPlanApproved = vi.fn();
      render(<Requests sessionId={SESSION} onPlanApproved={onPlanApproved} />);
      connect();
      askPlan();

      await user.click(screen.getByRole('button', { name: t('permission.plan.approve') }));

      expect(onPlanApproved).toHaveBeenCalledWith('default');
    });

    it('keeps planning by refusing it, with the comment as the reason for Claude — S-94', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Requests sessionId={SESSION} />);
      connect();
      askPlan();

      await user.type(
        screen.getByLabelText(t('permission.plan.commentLabel')),
        'Also cover the timezone',
      );
      await user.click(screen.getByRole('button', { name: t('permission.plan.keepPlanning') }));

      expect(answers()[0]?.['payload']).toMatchObject({
        decision: 'deny',
        reason: 'Also cover the timezone',
      });
    });

    it('lets the card go when the plan is approved on another device, with no second answer — S-95', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      askPlan();

      act(() => {
        sockets.latest.receive({
          v: 1,
          id: 'evt-1',
          kind: 'event',
          type: 'permission.resolved',
          ts: NOW.toISOString(),
          sessionId: SESSION,
          seq: 1,
          payload: { requestId: 'req-1', decision: 'allow', auto: false, resolvedBy: 'auth|42' },
        });
      });

      expect(
        screen.queryByRole('listitem', { name: t('permission.plan.label') }),
      ).not.toBeInTheDocument();
      expect(answers()).toHaveLength(0);
    });

    it('shows an empty plan as an empty plan, not as a failure', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask({ toolName: 'ExitPlanMode', input: {}, riskHint: 'read', defaultToNo: false });

      expect(
        screen.getByRole('listitem', { name: t('permission.plan.label') }),
      ).toBeInTheDocument();
    });

    it('never compacts a question about any other tool — S-76', () => {
      render(<Requests sessionId={SESSION} />);
      connect();
      ask();

      expect(screen.getByText('rm -rf build/')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: t('permission.scope.once') })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Bash: / })).not.toBeInTheDocument();
    });

    it('has no accessibility violation', async () => {
      const { container } = render(<Requests sessionId={SESSION} />);
      connect();
      askPlan();
      await screen.findByRole('heading', { name: 'The plan' });

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
