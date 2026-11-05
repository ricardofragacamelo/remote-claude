import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { MessageItem } from '@/features/session/components/conversation/MessageItem';
import type { TimelineContext } from '@/features/session/components/conversation/timeline-context';
import type { StreamMessage } from '@/features/session/types/live-session';
import { render, translator } from '../../../../../support/render';

const t = translator('en');

const CONTEXT: TimelineContext = {
  folder: '',
  sessionId: null,
  reference: null,
  conversation: { messages: [], tools: [], timeline: [], turns: [] },
  current: null,
};

/** A block of a kind this build does not know (U-05) — plan 27, F6 · B-20. */
describe('MessageItem — an unknown content block (U-05)', () => {
  it('draws it generically, in its place among the others, with its text', () => {
    const message: StreamMessage = {
      messageId: 'm1',
      role: 'assistant',
      text: 'Before.',
      blocks: [
        { kind: 'text', text: 'Before.' },
        { kind: 'unknown', text: 'extra detail', blockType: 'server_tool_use' },
      ],
      streaming: null,
      isComplete: true,
      parentToolUseId: null,
      thinkingMs: null,
      thinkingSince: null,
    };

    render(<MessageItem message={message} context={CONTEXT} showsAuthor={false} />);

    expect(
      screen.getByText(t('sessions.message.unknownBlock', { blockType: 'server_tool_use' })),
    ).toBeInTheDocument();
    expect(screen.getByText('extra detail')).toBeInTheDocument();
  });

  it('draws with no text at all when the block carries none', () => {
    const message: StreamMessage = {
      messageId: 'm1',
      role: 'assistant',
      text: '',
      blocks: [{ kind: 'unknown', text: '', blockType: 'server_tool_use' }],
      streaming: null,
      isComplete: true,
      parentToolUseId: null,
      thinkingMs: null,
      thinkingSince: null,
    };

    render(<MessageItem message={message} context={CONTEXT} showsAuthor={false} />);

    expect(
      screen.getByText(t('sessions.message.unknownBlock', { blockType: 'server_tool_use' })),
    ).toBeInTheDocument();
  });
});
