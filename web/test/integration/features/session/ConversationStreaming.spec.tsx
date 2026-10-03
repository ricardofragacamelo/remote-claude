import { describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';

import type { Envelope } from '@remote-claude/contracts';

import { Conversation } from '@/features/session/components/Conversation';
import { readEvent, SILENT } from '@/features/session/services/conversation-reducer';
import type { Conversation as ConversationState } from '@/features/session/types/live-session';
import { render } from '../../../support/render';

/** How many times each text was rendered as markdown — what a re-render of a message costs. */
const renders = vi.hoisted(() => new Map<string, number>());

vi.mock('@/features/session/components/conversation/ChatMarkdown', () => ({
  default: ({ source }: { readonly source: string }) => {
    const key = source.slice(0, 12);
    renders.set(key, (renders.get(key) ?? 0) + 1);
    return <p>{source.length > 40 ? `${source.slice(0, 12)}…` : source}</p>;
  },
}));

const T0 = '2026-09-19T12:00:00.000Z';

function frame(type: string, payload: Record<string, unknown>): Envelope {
  return { v: 1, id: `f-${type}`, kind: 'event', type, ts: T0, payload } as Envelope;
}

function view(conversation: ConversationState): React.JSX.Element {
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <Conversation conversation={conversation} isPartial={false} />
    </div>
  );
}

/**
 * A long answer streaming in (plan 08, S-64): only the message in flight renders again. Following the
 * end (S-81) is the frame's since plan 09, and is proven with it (`ChatFrame.spec`, S-07).
 */
describe('a conversation as it streams', () => {
  it('renders only the message in flight again, for an answer of 200 KB — S-64', async () => {
    renders.clear();
    let state = [
      frame('message.completed', {
        messageId: 'm1',
        role: 'assistant',
        content: [{ type: 'text', text: 'First answer' }],
      }),
    ].reduce(readEvent, SILENT);
    const { rerender } = render(view(state));
    await screen.findByText('First answer');
    // The renderer is loaded on demand, and the boundary that waited for it renders once more on
    // the next commit — a single time, nothing to do with what streams. That is the baseline.
    act(() => {
      rerender(view(state));
    });
    const before = renders.get('First answer') ?? 0;

    const chunk = 'y'.repeat(2_048);
    for (let index = 0; index < 100; index += 1) {
      state = readEvent(state, frame('message.delta', { messageId: 'm2', delta: chunk }));
      act(() => {
        rerender(view(state));
      });
    }

    expect(state.messages[1]?.text).toHaveLength(204_800);
    expect(before).toBeGreaterThan(0);
    expect(renders.get('First answer')).toBe(before);
    expect(renders.get('yyyyyyyyyyyy')).toBeGreaterThan(0);
  });

  it('follows nothing when nothing around it scrolls', async () => {
    const state = [frame('message.delta', { messageId: 'm1', delta: 'alone' })].reduce(
      readEvent,
      SILENT,
    );
    render(<Conversation conversation={state} isPartial={false} />);

    expect(await screen.findByText('alone')).toBeInTheDocument();
  });
});
