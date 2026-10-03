import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';

import { Conversation } from '@/features/session/components/Conversation';
import { ThinkingBlock } from '@/features/session/components/conversation/ThinkingBlock';
import {
  CompactedRow,
  RewoundRow,
  TurnRow,
} from '@/features/session/components/conversation/TurnRow';
import { WorkingIndicator } from '@/features/session/components/conversation/WorkingIndicator';
import type { WorkingIndicatorProps } from '@/features/session/components/conversation/WorkingIndicator';
import { verbOf } from '@/features/session/lib/working-verbs';
import { conversationFrom } from '@/features/session/services/conversation-reducer';
import { render, translator } from '../../../support/render';

const t = translator('en');
const NOW = new Date('2026-10-03T12:00:00.000Z');
const TURN = '01J0ABCDEFGHJKMNPQRSTVWXYZ:0';

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The indicator of a turn that began now, thinking. */
function shown(props: Partial<WorkingIndicatorProps> = {}): ReturnType<typeof render> {
  return render(
    <WorkingIndicator
      status="thinking"
      turnSince={NOW.toISOString()}
      turn={TURN}
      tool={null}
      waiting={0}
      {...props}
    />,
  );
}

const live = (): HTMLElement =>
  within(document.querySelector('[data-working-indicator]') as HTMLElement).getByRole('status');

/** The line of a turn that runs — plan 09, B-21. */
describe('the indicator of a turn', () => {
  it('shows our asterisk, the verb of the turn and the time — S-48', () => {
    shown({ turnSince: '2026-10-03T11:59:48.000Z' });

    expect(live()).toHaveTextContent(t(`sessions.workingVerb.${verbOf(TURN)}`));
    expect(screen.getByText(t('sessions.working.seconds', { seconds: 12 }))).toBeInTheDocument();
  });

  it('counts minutes past the first one', () => {
    shown({ turnSince: '2026-10-03T11:57:55.000Z' });

    expect(
      screen.getByText(t('sessions.working.minutes', { minutes: 2, seconds: '05' })),
    ).toBeInTheDocument();
  });

  it('is not there at rest, nor with the session closed — S-50', () => {
    const { container, rerender } = shown({ status: 'idle' });
    expect(container).toBeEmptyDOMElement();

    rerender(
      <WorkingIndicator status="closed" turnSince={null} turn={TURN} tool={null} waiting={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('says what it waits on as text, without a way to it when there is none to take — S-49', () => {
    shown({ status: 'waitingPermission', waiting: 1 });

    expect(live()).toHaveTextContent(t('sessions.working.waiting'));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('moves its asterisk only for who has not asked for less motion — S-51', () => {
    const { container } = shown();
    const glyph = container.querySelector('svg');

    expect(glyph).toHaveClass('motion-safe:animate-pulse', 'text-primary');
    expect(glyph?.getAttribute('class')?.split(' ')).not.toContain('animate-pulse');
    // The text and the clock go on, whatever the motion.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText(t('sessions.working.seconds', { seconds: 3 }))).toBeInTheDocument();
  });

  it('announces the change of what Claude does, never the clock: a minute with one tool is two announcements — S-52', () => {
    const { rerender } = shown();
    const announced: string[] = [];
    const sample = (): void => {
      const now = live().textContent ?? '';
      if (announced.at(-1) !== now) announced.push(now);
    };

    for (let second = 0; second < 30; second += 1) {
      sample();
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }
    rerender(
      <WorkingIndicator
        status="running"
        turnSince={NOW.toISOString()}
        turn={TURN}
        tool="Bash"
        waiting={0}
      />,
    );
    for (let second = 30; second < 60; second += 1) {
      sample();
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }

    expect(announced).toEqual([
      t(`sessions.workingVerb.${verbOf(TURN)}`),
      t('sessions.working.runningTool', { tool: 'Bash' }),
    ]);
    expect(live()).not.toHaveTextContent(/s$/);
    expect(
      screen.getByText(t('sessions.working.minutes', { minutes: 1, seconds: '00' })),
    ).toBeInTheDocument();
  });

  it('keeps the verb of the turn through a re-render and a reconnect; the next turn may draw another — S-53', () => {
    const { rerender, unmount } = shown();
    const first = live().textContent;

    rerender(
      <WorkingIndicator
        status="thinking"
        turnSince={NOW.toISOString()}
        turn={TURN}
        tool={null}
        waiting={0}
      />,
    );
    expect(live().textContent).toBe(first);
    unmount();

    // A reconnect draws the screen again, from the same turn.
    const again = shown();
    expect(live().textContent).toBe(first);

    const next = Array.from({ length: 20 }, (_, index) => `${TURN}:${String(index)}`).find(
      (turn) => verbOf(turn) !== verbOf(TURN),
    );
    again.rerender(
      <WorkingIndicator
        status="thinking"
        turnSince={null}
        turn={next ?? TURN}
        tool={null}
        waiting={0}
      />,
    );
    expect(live().textContent).not.toBe(first);
  });

  it('runs a tool of its own only while running — thinking, it says the verb', () => {
    shown({ status: 'thinking', tool: 'Bash' });

    expect(live()).toHaveTextContent(t(`sessions.workingVerb.${verbOf(TURN)}`));
  });
});

/** Thinking, read back from the history — plan 09, S-57. */
describe('a thinking of the history', () => {
  it('says only that it thought — never "0 s", never NaN — S-57', () => {
    render(
      <ThinkingBlock
        block={{ kind: 'thinking', text: 'hm' }}
        thinkingMs={null}
        streaming={false}
      />,
    );

    expect(screen.getByText(t('sessions.thinking.done'))).toBeInTheDocument();
    expect(screen.queryByText(/0 s|NaN/)).toBeNull();
  });
});

/** The rows of the system, and the search over the conversation — plan 09, B-28. */
describe('the rows of the system', () => {
  it('are one line each, in a quiet tone, and read whole — S-80', () => {
    vi.useRealTimers();
    render(
      <ul>
        <TurnRow
          turn={{
            turnId: 'turn-1',
            costUsd: '0.0123',
            durationMs: 4200,
            usage: { input: 1200, output: 34, cacheRead: 5000, cacheWrite: 0 },
          }}
        />
        <CompactedRow trigger="manual" preTokens={180_000} />
        <RewoundRow entry={{ restored: 2, kept: 1, failed: 1 }} />
      </ul>,
    );

    const rows = screen.getAllByRole('listitem').concat(screen.getByRole('separator'));
    for (const row of rows) {
      const text = row.querySelector('span');
      expect(text).toHaveClass('truncate');
      expect(row).toHaveClass('text-ui-xs', 'text-muted-foreground');
      expect(row.getAttribute('title')).toBe(text?.textContent);
    }
    expect(
      screen.getByText(t('sessions.rewound.failed', { restored: 2, kept: 1, failed: 1 })),
    ).toBeInTheDocument();
  });

  it('keeps the partial replay a strip of one line, and the search bar pinned at the top — S-79, S-80', () => {
    vi.useRealTimers();
    render(
      <Conversation
        conversation={conversationFrom([
          {
            type: 'message.completed',
            payload: {
              messageId: 'm1',
              role: 'assistant',
              content: [{ type: 'text', text: 'hi' }],
            },
          },
        ])}
        isPartial
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(t('session.screen.partial'));
    expect(screen.getByRole('note')).toHaveClass('text-ui-xs');

    fireEvent.keyDown(screen.getByRole('list', { name: t('session.screen.conversation') }), {
      key: 'f',
      ctrlKey: true,
    });

    expect(screen.getByRole('search')).toHaveClass('sticky', 'top-0', 'bg-background');
  });
});
