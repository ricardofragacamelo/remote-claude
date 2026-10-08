import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { anInteraction, aQuestionPayload } from '../../../support/question';
import { render, translator } from '../../../support/render';
import { SESSION } from '../../../support/session-tools';

const t = translator('en');
const NOW = new Date('2026-10-08T12:00:00.000Z');
const FOLDER = '/srv/app';

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
});

function says(type: string, payload: Record<string, unknown>): void {
  seq += 1;
  live.receive({ ...hubEvent(SESSION, type, seq, payload), ts: NOW.toISOString() });
}

/** A question of Claude, as the server asks it. */
function asks(overrides: Record<string, unknown> = {}): void {
  live.receive({
    v: 1,
    id: 'frame-q',
    kind: 'request',
    type: 'permission.requested',
    ts: NOW.toISOString(),
    sessionId: SESSION,
    payload: {
      requestId: 'req-q',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      ...aQuestionPayload(overrides),
    },
  });
}

function opened(): void {
  render(<SessionScreen sessionId={SESSION} />);
  live.connect();
  says('session.started', {
    sessionId: SESSION,
    claudeSessionId: 'conv-1',
    workspacePath: FOLDER,
    model: 'claude-opus-5',
    permissionMode: 'default',
  });
}

const conversation = (): HTMLElement =>
  screen.getByRole('list', { name: t('session.screen.conversation') });
const questionCard = (): HTMLElement =>
  screen.getByRole('listitem', { name: t('permission.question.label') });
const resolves = (): Record<string, unknown>[] =>
  live.sent().filter((frame) => frame['type'] === 'permission.resolve');

const ANSWERED = [
  { questionId: 'q1', selected: ['Usage', 'License'] },
  { questionId: 'q2', selected: [], other: 'a wiki page' },
  { questionId: 'q3', selected: ['Friendly'] },
];

describe('a question of Claude in the conversation — plan 24, F3', () => {
  it('stands in the place of its tool, and becomes the questions answered — S-77', async () => {
    const user = userEvent.setup();
    opened();
    says('tool.started', { toolUseId: 'toolu-q', toolName: 'AskUserQuestion', input: {} });
    asks();

    expect(
      within(conversation()).getByRole('listitem', { name: t('permission.question.label') }),
    ).toBe(questionCard());
    await user.click(screen.getByRole('checkbox', { name: /Usage/ }));
    expect(resolves()).toEqual([]);

    says('permission.resolved', {
      requestId: 'req-q',
      decision: 'allow',
      auto: false,
      resolvedBy: 'me',
      resolvedFrom: 'mobile',
      toolUseId: 'toolu-q',
      answers: ANSWERED,
    });
    says('tool.completed', { toolUseId: 'toolu-q', status: 'succeeded', summary: 'answered' });

    expect(screen.queryByRole('listitem', { name: t('permission.question.label') })).toBeNull();
    const line = within(conversation()).getByRole('button', {
      name: new RegExp(t('permission.question.askedMany', { count: 3 })),
    });
    expect(line).toHaveAttribute('aria-expanded', 'true');
    const answered = document.querySelector('[data-answered-questions="answered"]') as HTMLElement;
    expect(within(answered).getByText('Usage').closest('li')).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(answered).getByText('Installation').closest('li')).not.toHaveAttribute(
      'aria-current',
    );
    expect(
      within(answered).getByText(t('permission.question.otherAnswer', { text: 'a wiki page' })),
    ).toBeInTheDocument();
    // The questions, never the JSON of the input.
    expect(screen.queryByText(/"questions"/)).toBeNull();
  });

  it('says why it was not answered, and that one still open is waiting — S-78', () => {
    opened();
    says('tool.started', { toolUseId: 'toolu-w', toolName: 'AskUserQuestion', input: {} });
    expect(
      within(conversation()).getByRole('button', {
        name: new RegExp(t('permission.question.pending')),
      }),
    ).toBeInTheDocument();

    says('tool.started', { toolUseId: 'toolu-q', toolName: 'AskUserQuestion', input: {} });
    asks();
    says('permission.resolved', {
      requestId: 'req-q',
      decision: 'deny',
      auto: false,
      resolvedBy: 'me',
      resolvedFrom: 'web',
      toolUseId: 'toolu-q',
    });
    says('tool.completed', { toolUseId: 'toolu-q', status: 'denied', summary: 'not now' });

    expect(
      screen.getByText(t('permission.question.declined', { reason: 'not now' })),
    ).toBeInTheDocument();
  });

  it('names its line after its one question — S-79', () => {
    opened();
    says('tool.started', { toolUseId: 'toolu-q', toolName: 'AskUserQuestion', input: {} });
    asks({
      interaction: {
        kind: 'question',
        malformed: false,
        questions: [
          {
            id: 'q1',
            header: 'Tone',
            prompt: 'Which tone?',
            multiSelect: false,
            options: [
              { label: 'Friendly', description: '' },
              { label: 'Formal', description: '' },
            ],
          },
        ],
      },
    });
    says('permission.resolved', {
      requestId: 'req-q',
      decision: 'allow',
      auto: false,
      resolvedBy: 'me',
      toolUseId: 'toolu-q',
      answers: [{ questionId: 'q1', selected: ['Formal'] }],
    });

    expect(
      within(conversation()).getByRole('button', {
        name: new RegExp(t('permission.question.asked', { header: 'Tone' })),
      }),
    ).toBeInTheDocument();
  });

  it('keeps the question of a subagent at the end, where it is answered — S-76', async () => {
    const user = userEvent.setup();
    opened();
    says('tool.started', { toolUseId: 'a1', toolName: 'Agent', input: { description: 'look' } });
    says('tool.started', {
      toolUseId: 'toolu-q',
      toolName: 'AskUserQuestion',
      input: {},
      parentToolUseId: 'a1',
    });
    asks();

    const tail = screen.getByRole('list', { name: t('sessions.inline.tail') });
    expect(within(tail).getByRole('listitem', { name: t('permission.question.label') })).toBe(
      questionCard(),
    );

    await user.click(screen.getByRole('checkbox', { name: /Usage/ }));
    await user.click(screen.getByRole('tab', { name: /^Format/ }));
    await user.click(screen.getByRole('radio', { name: /Plain list/ }));
    await user.click(screen.getByRole('radio', { name: /Friendly/ }));
    await user.click(screen.getByRole('button', { name: t('permission.question.submit') }));

    expect(resolves()[0]?.['payload']).toMatchObject({ requestId: 'req-q', decision: 'allow' });
  });

  it('says it waits for an answer to a question, never what it asks — S-80', () => {
    opened();
    says('turn.started', {});
    says('session.statusChanged', { status: 'waitingPermission' });
    asks();

    const indicator = document.querySelector('[data-working-indicator]') as HTMLElement;
    expect(within(indicator).getByRole('status')).toHaveTextContent(
      t('permission.question.waiting'),
    );
    expect(indicator).not.toHaveTextContent('README');
    expect(
      screen.getByText(t('permission.question.pill', { count: 1 }), {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
  });

  it('says what it said before for a permission — S-80', () => {
    opened();
    says('turn.started', {});
    says('session.statusChanged', { status: 'waitingPermission' });
    asks({ toolName: 'Bash', interaction: undefined, title: 'permission.tool.Bash' });

    const indicator = document.querySelector('[data-working-indicator]') as HTMLElement;
    expect(within(indicator).getByRole('status')).toHaveTextContent(t('sessions.working.waiting'));
  });

  it('says a question ran out of time, and one a rule refused was declined — S-78', () => {
    opened();
    says('tool.started', { toolUseId: 'toolu-q', toolName: 'AskUserQuestion', input: {} });
    asks();
    says('permission.resolved', {
      requestId: 'req-q',
      decision: 'deny',
      auto: true,
      toolUseId: 'toolu-q',
    });
    says('tool.completed', { toolUseId: 'toolu-q', status: 'denied', summary: 'late' });

    expect(screen.getByText(t('permission.question.expired'))).toBeInTheDocument();

    says('tool.started', { toolUseId: 'toolu-r', toolName: 'AskUserQuestion', input: {} });
    asks({ toolUseId: 'toolu-r', requestId: 'req-r' });
    says('permission.resolved', {
      requestId: 'req-r',
      decision: 'deny',
      auto: true,
      resolvedBy: 'me',
      via: 'rule',
      toolUseId: 'toolu-r',
    });
    says('tool.completed', { toolUseId: 'toolu-r', status: 'denied', summary: 'by a rule' });

    expect(
      screen.getByText(t('permission.question.declined', { reason: 'by a rule' })),
    ).toBeInTheDocument();
  });
});

describe('a question of Claude read back — plan 24, F5', () => {
  /** The end of an `AskUserQuestion`, as the history carries it. */
  function ended(
    question: Record<string, unknown>,
    status = 'succeeded',
    summary = 'answered',
  ): void {
    says('tool.started', { toolUseId: 'toolu-h', toolName: 'AskUserQuestion', input: {} });
    says('tool.completed', { toolUseId: 'toolu-h', status, summary, question });
  }

  it('draws the questions answered from what the history carries, as live — S-102', () => {
    opened();
    ended({ interaction: anInteraction(), outcome: 'answered', answers: ANSWERED });

    const line = within(conversation()).getByRole('button', {
      name: new RegExp(t('permission.question.askedMany', { count: 3 })),
    });
    expect(line).toHaveAttribute('aria-expanded', 'true');
    const answered = document.querySelector('[data-answered-questions="answered"]') as HTMLElement;
    expect(within(answered).getByText('Usage').closest('li')).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(answered).getByText(t('permission.question.otherAnswer', { text: 'a wiki page' })),
    ).toBeInTheDocument();
  });

  it('says a refusal with its reason, and a question that ran out — S-102', () => {
    opened();
    ended({ interaction: anInteraction(), outcome: 'declined', reason: 'Not now.' }, 'denied', 'x');
    expect(
      screen.getByText(t('permission.question.declined', { reason: 'Not now.' })),
    ).toBeInTheDocument();
  });

  it('says one with no record here was answered elsewhere, with what the CLI said — S-102', () => {
    opened();
    ended({ interaction: anInteraction() }, 'succeeded', 'Your questions have been answered');

    expect(screen.getByText(t('permission.question.answeredElsewhere'))).toBeInTheDocument();
    expect(screen.getByText('Your questions have been answered')).toBeInTheDocument();
  });

  it('draws an end it cannot read like any other tool', () => {
    opened();
    ended({ interaction: 'not a question' });

    expect(document.querySelector('[data-answered-questions]')).toBeNull();
  });
});
