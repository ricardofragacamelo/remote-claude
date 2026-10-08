import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InlinePermission } from '@/features/session/components/conversation/InlinePermission';
import { MessageActions } from '@/features/session/components/conversation/MessageActions';
import type { InlineContext } from '@/features/session/components/conversation/timeline-context';
import type { InlineRequests } from '@/features/session/hooks/useInlineRequests';
import type { PermissionRequest } from '@/features/permission';
import type { StreamMessage } from '@/features/session/types/live-session';
import { render, translator } from '../../../support/render';

const t = translator('en');

const PROMPT: StreamMessage = {
  messageId: 'u1',
  role: 'user',
  text: 'refactor the parser',
  blocks: [{ kind: 'text', text: 'refactor the parser' }],
  streaming: null,
  isComplete: true,
  parentToolUseId: null,
  thinkingMs: null,
  thinkingSince: null,
};

/** What is done from a prompt — plan 09, B-27. */
describe('the actions of a prompt', () => {
  it('edits, forks and undoes the prompt they belong to — S-75', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onFork = vi.fn();
    const onUndo = vi.fn();
    render(<MessageActions message={PROMPT} actions={{ onEdit, onFork, onUndo }} />);

    await user.click(screen.getByRole('button', { name: t('sessions.message.edit') }));
    await user.click(screen.getByRole('button', { name: t('sessions.message.forkFrom') }));
    await user.click(screen.getByRole('button', { name: t('sessions.message.undo') }));

    expect(onEdit).toHaveBeenCalledWith(PROMPT);
    expect(onFork).toHaveBeenCalledWith(PROMPT);
    expect(onUndo).toHaveBeenCalledWith(PROMPT);
  });

  it('refuses the undo with its reason, and offers only what it was given — S-77, S-78', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<MessageActions message={PROMPT} actions={{ onUndo, undoBlocked: 'not now' }} />);

    const undo = screen.getByRole('button', { name: 'not now' });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    await user.click(undo);

    expect(onUndo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t('sessions.message.edit') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('sessions.message.forkFrom') })).toBeNull();
  });
});

/** A card drawn before its countdown was computed says no time is left, rather than nothing. */
describe('an inline card', () => {
  it('reads a request with no countdown yet as one with none left', () => {
    const request: PermissionRequest = {
      requestId: 'req-1',
      frameId: 'frame-1',
      toolUseId: 't1',
      toolName: 'Bash',
      description: 'ls',
      input: { command: 'ls' },
      riskHint: 'read',
      defaultToNo: false,
      expiresAt: '2999-01-01T00:00:00.000Z',
      suggestions: [],
      reaches: [],
      interaction: null,
      isAnswering: false,
    };
    const requests = {
      pending: [request],
      settled: [],
      remainingMs: {},
      refusal: null,
      answer: vi.fn(),
      extend: vi.fn(),
      byTool: new Map(),
      settledByTool: new Map(),
      drafts: {},
      saveDraft: vi.fn(),
      answerQuestion: vi.fn(),
      declineQuestion: vi.fn(),
    } satisfies InlineRequests;
    const inline: InlineContext = { requests, folder: '' };

    render(
      <ul>
        <InlinePermission request={request} inline={inline} />
      </ul>,
    );

    expect(screen.getByRole('timer')).toHaveTextContent(
      t('permission.card.remaining', { seconds: 0 }),
    );
  });
});
