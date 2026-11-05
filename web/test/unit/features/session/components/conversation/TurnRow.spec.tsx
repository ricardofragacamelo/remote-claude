import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import {
  CompactedRow,
  InjectedRow,
  NoticeRow,
} from '@/features/session/components/conversation/TurnRow';
import type { TimelineEntry } from '@/features/session/types/live-session';
import { render, translator } from '../../../../../support/render';

const t = translator('en');

function notice(
  overrides: Partial<Extract<TimelineEntry, { kind: 'notice' }>> = {},
): Extract<TimelineEntry, { kind: 'notice' }> {
  return {
    kind: 'notice',
    id: 'notice:n1',
    noticeKind: 'command.output',
    level: 'info',
    text: 'README.md',
    truncated: false,
    parentToolUseId: null,
    ...overrides,
  };
}

/** The notice row — plan 27, F6 · B-19, B-20. */
describe('NoticeRow — plan 27, F6 · B-19, B-20', () => {
  it('S-72 · a known kind draws its own label, folded until opened', () => {
    render(<NoticeRow entry={notice()} />);

    expect(screen.getByText('Command output')).toBeInTheDocument();
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Command output'));
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('S-73 · an error-level notice draws in the destructive colour token', () => {
    render(<NoticeRow entry={notice({ noticeKind: 'auth.failed', level: 'error' })} />);

    const title = screen.getByText('Authentication failed');
    expect(title.closest('li')).toHaveClass('text-destructive');
  });

  it('S-74 · command.output opens in safe markdown; raw HTML stays text', async () => {
    const { container } = render(
      <NoticeRow entry={notice({ text: '# heading\n<script>alert(1)</script>' })} />,
    );

    fireEvent.click(screen.getByText('Command output'));

    expect(await screen.findByText('heading')).toBeInTheDocument();
    // The safe renderer never turns raw HTML into an element — skipped or shown as text, either
    // way there is no live <script> element in the rendered output (R-01).
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('a notice whose text is untrusted stays plain, even with markup in it', () => {
    render(
      <NoticeRow entry={notice({ noticeKind: 'model.refused', text: '# not a heading here' })} />,
    );

    fireEvent.click(screen.getByText('The model refused to answer'));
    expect(screen.getByText('# not a heading here')).toBeInTheDocument();
  });

  it('a messageKey the backend sent is translated, with its params', () => {
    render(
      <NoticeRow
        entry={notice({
          noticeKind: 'model.switched',
          text: null,
          messageKey: 'sessions.notice.modelSwitched',
          params: { to: 'claude-haiku', from: 'claude-opus' },
        })}
      />,
    );

    fireEvent.click(screen.getByText('The model changed'));
    expect(screen.getByText('Answered by claude-haiku instead of claude-opus')).toBeInTheDocument();
  });

  it('U-11 · a kind this build has no line for reads as unknown, named by the detail', () => {
    render(
      <NoticeRow
        entry={notice({
          noticeKind: 'a.future.kind',
          reason: 'unknownNotice',
          detail: 'system:future_thing',
          text: 'details',
        })}
      />,
    );

    expect(screen.getByText(/system:future_thing/)).toBeInTheDocument();
  });

  it('U-06 · an unknown WS event names it, with its own reason', () => {
    render(
      <NoticeRow
        entry={{
          kind: 'notice',
          id: 'unknown-event:x',
          reason: 'unknownEvent',
          detail: 'session.somethingNew',
          level: 'notice',
          text: null,
          truncated: false,
          parentToolUseId: null,
        }}
      />,
    );

    expect(screen.getByText(/session\.somethingNew/)).toBeInTheDocument();
  });

  it('D-12 · a repeated notice shows the "×N" counter', () => {
    render(<NoticeRow entry={notice({ count: 10 })} />);

    expect(screen.getByText('×10')).toBeInTheDocument();
  });

  it('a truncated text says so, once opened', () => {
    render(<NoticeRow entry={notice({ truncated: true })} />);

    fireEvent.click(screen.getByText('Command output'));
    expect(screen.getByText(/Cut/)).toBeInTheDocument();
  });

  it('a notice with nothing to show opens to nothing, and the button is disabled', () => {
    render(<NoticeRow entry={notice({ text: null, noticeKind: 'agent.stopping' })} />);

    const button = screen.getByText('The agent is stopping').closest('button')!;
    expect(button).toBeDisabled();
  });
});

/** The compaction row with "see summary" — plan 27, F6 · B-21. */
describe('CompactedRow — plan 27, F6 · B-21', () => {
  it('without a summary, draws the plain line and offers nothing to open', () => {
    render(<CompactedRow trigger="manual" preTokens={null} summary={null} />);

    expect(screen.queryByText(t('sessions.compacted.summary'))).not.toBeInTheDocument();
  });

  it('with a summary, "see summary" opens the markdown', async () => {
    render(<CompactedRow trigger="auto" preTokens={9000} summary="# what changed" />);

    expect(screen.queryByText('what changed')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(t('sessions.compacted.summary')));
    expect(await screen.findByText('what changed')).toBeInTheDocument();
  });
});

/** What the agent injected, its own quiet line — plan 27, F6 · B-21. */
describe('InjectedRow — plan 27, F6 · B-21', () => {
  it('an injected skill body names it, "x loaded"', () => {
    render(<InjectedRow injectedKind="instructions" name="pr-reviewer" />);

    expect(screen.getByText('pr-reviewer loaded')).toBeInTheDocument();
  });

  it('injected content this build has no specific line for reads generically', () => {
    render(<InjectedRow injectedKind="other" name={null} />);

    expect(screen.getByText('The agent added content here')).toBeInTheDocument();
  });
});
