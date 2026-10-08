import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import {
  AnsweredQuestions,
  forgetPermissionQueues,
  permissionQueueOf,
  PermissionRequestCard,
  usePermissionQueue,
} from '@/features/permission';
import { setAccessToken } from '@/shared/api/credentials';
import { wsClient } from '@/shared/api/ws';
import { render, translator } from '../../../support/render';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import type { InstalledWebSocket } from '../../../support/fake-websocket';
import { QUESTIONS, aQuestionPayload, anInteraction } from '../../../support/question';

const t = translator('en');
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const NOW = new Date('2026-10-08T12:00:00.000Z');

const readyFrame = {
  v: 1,
  id: 'srv-0',
  kind: 'ack',
  type: 'connection.ready',
  ts: NOW.toISOString(),
  payload: { connectionId: 'c1', serverVersion: '1', limits: {} },
};

/** The questions of a session, as the conversation draws them: the card, and the line it became. */
function Asked(): React.JSX.Element {
  const queue = usePermissionQueue(SESSION);
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
              question={{
                drafts: queue.drafts,
                onDraft: queue.saveDraft,
                onSubmit: queue.answerQuestion,
                onDecline: queue.declineQuestion,
              }}
            />
          ))}
        </ul>
      )}
      {last?.interaction != null && (
        <AnsweredQuestions
          interaction={last.interaction}
          answers={last.answers}
          end={last.decision === 'allow' ? 'answered' : last.auto ? 'expired' : 'declined'}
        />
      )}
      {queue.refusal !== null && <p role="alert">{t(queue.refusal.messageKey)}</p>}
    </>
  );
}

describe('the card of a question of Claude — plan 24, B-13, B-14', () => {
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

  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  function opened(questions: readonly unknown[] = QUESTIONS, malformed = false): HTMLElement {
    const { container } = render(<Asked />);
    act(() => {
      wsClient.connect();
      sockets.latest.open();
      sockets.latest.receive(readyFrame);
    });
    ask(questions, malformed);
    return container;
  }

  function ask(questions: readonly unknown[] = QUESTIONS, malformed = false): void {
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'frame-q',
        kind: 'request',
        type: 'permission.requested',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        payload: {
          requestId: 'req-q',
          expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
          ...aQuestionPayload({ interaction: anInteraction(questions, malformed) }),
        },
      });
    });
  }

  const card = (): HTMLElement =>
    screen.getByRole('listitem', { name: t('permission.question.label') });
  const answers = (): Record<string, unknown>[] =>
    sockets.latest.frames().filter((sent) => sent['type'] === 'permission.resolve');
  const submit = (): HTMLElement =>
    screen.getByRole('button', { name: t('permission.question.submit') });
  const tab = (header: string): HTMLElement =>
    screen.getByRole('tab', { name: new RegExp(`^${header}`) });

  it('offers a single choice as radios: choosing one clears the other, and one question is enough — S-64', async () => {
    const clicks = user();
    opened([QUESTIONS[1]]);

    expect(within(card()).getByRole('radiogroup')).toBeInTheDocument();
    expect(submit()).toBeDisabled();

    await clicks.click(screen.getByRole('radio', { name: /Classic prose/ }));
    await clicks.click(screen.getByRole('radio', { name: /Badge-heavy landing/ }));

    expect(screen.getByRole('radio', { name: /Classic prose/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Badge-heavy landing/ })).toBeChecked();

    await clicks.click(submit());
    expect(answers()).toEqual([
      expect.objectContaining({
        kind: 'response',
        correlationId: 'frame-q',
        payload: {
          requestId: 'req-q',
          decision: 'allow',
          scope: 'once',
          answers: [{ questionId: 'q2', selected: ['Badge-heavy landing'] }],
        },
      }),
    ]);
  });

  it('offers a multiple choice as checkboxes that toggle, and stays on it — S-65', async () => {
    const clicks = user();
    opened();

    expect(within(card()).getByRole('group', { name: QUESTIONS[0].prompt })).toBeInTheDocument();
    await clicks.click(screen.getByRole('checkbox', { name: /Installation/ }));
    await clicks.click(screen.getByRole('checkbox', { name: /Usage/ }));
    await clicks.click(screen.getByRole('checkbox', { name: /Installation/ }));

    expect(screen.getByRole('checkbox', { name: /Installation/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Usage/ })).toBeChecked();
    expect(tab('Sections')).toHaveAttribute('aria-selected', 'true');
  });

  it('offers "Other" last, opens its field with the focus, and an empty one is no answer — S-66', async () => {
    const clicks = user();
    opened([QUESTIONS[1]]);

    const options = within(card()).getAllByRole('radio');
    expect(options.at(-1)).toHaveAccessibleName(t('permission.question.other'));

    await clicks.click(options.at(-1)!);
    const field = screen.getByRole('textbox', { name: t('permission.question.other') });
    expect(field).toHaveFocus();
    expect(submit()).toBeDisabled();

    await clicks.type(field, '   ');
    expect(submit()).toBeDisabled();

    await clicks.type(field, 'a wiki page');
    await clicks.click(submit());
    expect(answers()[0]?.['payload']).toMatchObject({
      answers: [{ questionId: 'q2', selected: [], other: 'a wiki page' }],
    });
  });

  it('names each tab by its header, and marks the answered ones — S-67', async () => {
    const clicks = user();
    opened();

    expect(screen.getAllByRole('tab').map((each) => each.textContent)).toEqual([
      'Sections',
      'Format',
      'Tone',
    ]);
    await clicks.click(screen.getByRole('checkbox', { name: /License/ }));

    expect(tab('Sections')).toHaveAccessibleName(`Sections ${t('permission.question.answered')}`);
    expect(tab('Format')).toHaveAccessibleName('Format');
  });

  it('goes on by itself after a single choice that is not the last, and never after a multiple one — S-68', async () => {
    const clicks = user();
    opened();

    await clicks.click(screen.getByRole('checkbox', { name: /Usage/ }));
    expect(tab('Sections')).toHaveAttribute('aria-selected', 'true');

    await clicks.click(tab('Format'));
    await clicks.click(screen.getByRole('radio', { name: /Classic prose/ }));
    expect(tab('Tone')).toHaveAttribute('aria-selected', 'true');

    await clicks.click(screen.getByRole('radio', { name: /Friendly/ }));
    expect(tab('Tone')).toHaveAttribute('aria-selected', 'true');
  });

  it('sends nothing until every question has an answer, then all of them in order — S-69', async () => {
    const clicks = user();
    opened();

    await clicks.click(screen.getByRole('checkbox', { name: /Usage/ }));
    await clicks.click(screen.getByRole('checkbox', { name: /License/ }));
    expect(submit()).toBeDisabled();

    await clicks.click(tab('Tone'));
    await clicks.click(screen.getByRole('radio', { name: /Friendly/ }));
    expect(submit()).toBeDisabled();

    await clicks.click(tab('Format'));
    await clicks.click(screen.getByRole('radio', { name: /Plain list/ }));
    expect(submit()).toBeEnabled();

    await clicks.click(submit());
    expect(answers()[0]?.['payload']).toMatchObject({
      answers: [
        { questionId: 'q1', selected: ['Usage', 'License'] },
        { questionId: 'q2', selected: ['Plain list'] },
        { questionId: 'q3', selected: ['Friendly'] },
      ],
    });
  });

  it('previews the option in focus as safe markdown, says when there is none, and never on a multiple choice — S-70', async () => {
    const clicks = user();
    opened();

    expect(screen.queryByRole('region', { name: t('permission.question.preview') })).toBeNull();

    await clicks.click(tab('Format'));
    const preview = await screen.findByRole('region', { name: t('permission.question.preview') });
    expect(
      await within(preview).findByRole('heading', { name: 'Project Name' }),
    ).toBeInTheDocument();

    await clicks.hover(screen.getByText('Badge-heavy landing'));
    expect(await within(preview).findByRole('heading', { name: 'Badges' })).toBeInTheDocument();
    // The HTML Claude wrote never becomes an element: the safe renderer parses none.
    expect(preview.querySelector('[align]')).toBeNull();

    await clicks.hover(screen.getByText('Plain list'));
    expect(within(preview).getByText(t('permission.question.noPreview'))).toBeInTheDocument();
  });

  it('highlights the option Claude recommends, and does not choose it — S-71', async () => {
    const clicks = user();
    opened();

    await clicks.click(tab('Tone'));
    const recommended = screen.getByRole('radio', { name: /Professional \(Recommended\)/ });

    expect(recommended).not.toBeChecked();
    expect(recommended.closest('label')).toHaveAttribute('data-recommended', 'true');
    expect(within(card()).getByText(t('permission.question.recommended'))).toBeInTheDocument();
  });

  it('refuses with "Don\'t answer", or Esc, with the reason written or our own sentence — S-72', async () => {
    const clicks = user();
    opened();

    await clicks.keyboard('{Escape}');
    expect(
      screen.getByRole('textbox', { name: t('permission.question.declineReason') }),
    ).toHaveFocus();
    await clicks.click(screen.getByRole('button', { name: t('permission.question.declineBack') }));

    await clicks.click(screen.getByRole('button', { name: t('permission.question.decline') }));
    await clicks.click(
      screen.getByRole('button', { name: t('permission.question.declineConfirm') }),
    );

    expect(answers()[0]?.['payload']).toEqual({
      requestId: 'req-q',
      decision: 'deny',
      scope: 'once',
      reason: 'The user chose not to answer the question.',
    });
  });

  it('sends the reason the person wrote', async () => {
    const clicks = user();
    opened();

    await clicks.click(screen.getByRole('button', { name: t('permission.question.decline') }));
    await clicks.type(
      screen.getByRole('textbox', { name: t('permission.question.declineReason') }),
      'ask me tomorrow',
    );
    await clicks.click(
      screen.getByRole('button', { name: t('permission.question.declineConfirm') }),
    );

    expect(answers()[0]?.['payload']).toMatchObject({
      decision: 'deny',
      reason: 'ask me tomorrow',
    });
  });

  it('counts down, extends, and once out of time leaves as expired, its draft gone — S-73', async () => {
    const clicks = user();
    opened();

    expect(within(card()).getByRole('timer')).toHaveTextContent(
      t('permission.card.remaining', { seconds: 600 }),
    );
    await clicks.click(screen.getByRole('button', { name: t('permission.card.extend') }));
    expect(sockets.latest.frames().some((sent) => sent['type'] === 'permission.extend')).toBe(true);

    await clicks.click(screen.getByRole('checkbox', { name: /Usage/ }));
    expect(permissionQueueOf(SESSION).getState().drafts['req-q']).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(601_000);
    });

    expect(screen.queryByRole('listitem', { name: t('permission.question.label') })).toBeNull();
    expect(screen.getByText(t('permission.question.expired'))).toBeInTheDocument();
    expect(permissionQueueOf(SESSION).getState().drafts['req-q']).toBeUndefined();
  });

  it('is driven from the keyboard, with the focus on the first option, and is accessible — S-74', async () => {
    const keys = user();
    const container = opened();

    const first = screen.getByRole('checkbox', { name: /Installation/ });
    expect(first).toHaveFocus();

    await keys.keyboard('{ArrowDown}');
    expect(screen.getByRole('checkbox', { name: /Usage/ })).toHaveFocus();
    await keys.keyboard('{Enter}');
    expect(screen.getByRole('checkbox', { name: /Usage/ })).toBeChecked();

    await keys.keyboard('{ArrowRight}');
    expect(tab('Format')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: /Classic prose/ })).toHaveFocus();
    expect(
      within(card()).getByRole('radiogroup', { name: QUESTIONS[1].prompt }),
    ).toBeInTheDocument();

    await keys.keyboard('{Enter}');
    expect(tab('Tone')).toHaveAttribute('aria-selected', 'true');
    await keys.keyboard('{Enter}');

    await keys.keyboard('{Control>}{Enter}{/Control}');
    expect(answers()).toHaveLength(1);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers only a refusal for a question nobody could read — S-75', async () => {
    const clicks = user();
    opened([], true);

    expect(within(card()).getByText(t('permission.question.malformed'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('permission.question.submit') })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    await clicks.click(screen.getByRole('button', { name: t('permission.question.decline') }));
    expect(answers()[0]?.['payload']).toMatchObject({ decision: 'deny' });
  });

  it('takes no second answer while one is on its way, and keeps the draft when the socket was down — S-75', async () => {
    const clicks = user();
    opened([QUESTIONS[1]]);

    await clicks.click(screen.getByRole('radio', { name: /Classic prose/ }));
    act(() => {
      wsClient.close();
    });
    await clicks.click(submit());

    // Nothing left: the card is given back, with what was chosen.
    expect(answers()).toEqual([]);
    expect(submit()).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Classic prose/ })).toBeChecked();
  });

  it('blocks the card while the answer is on its way', async () => {
    const clicks = user();
    opened([QUESTIONS[1]]);

    await clicks.click(screen.getByRole('radio', { name: /Classic prose/ }));
    await clicks.click(submit());

    expect(submit()).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Classic prose/ })).toBeDisabled();
    expect(within(card()).getByText(t('permission.card.sending'))).toBeInTheDocument();
  });

  it('keeps the draft when the attach republishes the question — S-62', async () => {
    const clicks = user();
    opened();

    await clicks.click(screen.getByRole('checkbox', { name: /License/ }));
    act(() => {
      permissionQueueOf(SESSION).getState().reset();
    });
    ask();

    expect(screen.getByRole('checkbox', { name: /License/ })).toBeChecked();
  });

  it('gives way to the questions answered elsewhere, its draft gone — S-63', async () => {
    const clicks = user();
    opened();

    await clicks.click(screen.getByRole('checkbox', { name: /License/ }));
    act(() => {
      sockets.latest.receive({
        v: 1,
        id: 'evt-1',
        kind: 'event',
        type: 'permission.resolved',
        ts: NOW.toISOString(),
        sessionId: SESSION,
        seq: 1,
        payload: {
          requestId: 'req-q',
          decision: 'allow',
          auto: false,
          resolvedBy: 'someone',
          resolvedFrom: 'mobile',
          answers: [
            { questionId: 'q1', selected: ['Usage'] },
            { questionId: 'q2', selected: [], other: 'a wiki' },
            { questionId: 'q3', selected: ['Friendly'] },
          ],
        },
      });
    });

    expect(screen.queryByRole('listitem', { name: t('permission.question.label') })).toBeNull();
    expect(permissionQueueOf(SESSION).getState().drafts['req-q']).toBeUndefined();
    expect(screen.getByText('Usage').closest('li')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('License').closest('li')).not.toHaveAttribute('aria-current');
    expect(
      screen.getByText(t('permission.question.otherAnswer', { text: 'a wiki' })),
    ).toBeInTheDocument();
  });

  it('walks back with ← and ↑, and Enter on a tab chooses nothing — S-74', async () => {
    const keys = user();
    opened();

    await keys.keyboard('{ArrowUp}');
    expect(screen.getByRole('checkbox', { name: t('permission.question.other') })).toHaveFocus();
    await keys.keyboard('{ArrowRight}');
    await keys.keyboard('{ArrowLeft}');
    expect(tab('Sections')).toHaveAttribute('aria-selected', 'true');

    tab('Format').focus();
    await keys.keyboard('{Enter}');
    expect(screen.getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(
      false,
    );
  });

  it('sends nothing on Ctrl+Enter before every question has an answer — S-69', async () => {
    const keys = user();
    opened();

    await keys.keyboard('{Control>}{Enter}{/Control}');
    expect(answers()).toEqual([]);
  });

  it('goes on with Enter in the free answer, and sends from the last one — S-66', async () => {
    const clicks = user();
    opened([QUESTIONS[1], QUESTIONS[2]]);

    await clicks.click(screen.getByRole('radio', { name: t('permission.question.other') }));
    await clicks.type(
      screen.getByRole('textbox', { name: t('permission.question.other') }),
      'mine{Enter}',
    );
    expect(tab('Tone')).toHaveAttribute('aria-selected', 'true');

    await clicks.click(screen.getByRole('radio', { name: t('permission.question.other') }));
    await clicks.type(
      screen.getByRole('textbox', { name: t('permission.question.other') }),
      'dry{Enter}',
    );
    expect(answers()[0]?.['payload']).toMatchObject({
      answers: [
        { questionId: 'q2', selected: [], other: 'mine' },
        { questionId: 'q3', selected: [], other: 'dry' },
      ],
    });
  });

  it('sends with Ctrl+Enter or ⌘+Enter from the free answer too — S-74', async () => {
    const clicks = user();
    opened([QUESTIONS[2]]);

    await clicks.click(screen.getByRole('radio', { name: t('permission.question.other') }));
    const field = screen.getByRole('textbox', { name: t('permission.question.other') });
    await clicks.type(field, 'formal');
    await clicks.keyboard('{Meta>}{Enter}{/Meta}');

    expect(answers()).toHaveLength(1);
  });

  it('names the tab of a question with no header by its id', () => {
    opened([
      { ...QUESTIONS[2], header: '' },
      { ...QUESTIONS[1], id: 'q2' },
    ]);

    expect(screen.getAllByRole('tab').map((each) => each.textContent)).toEqual(['q3', 'Format']);
  });

  it('shows a question answered where no record was kept, with what the CLI said — D-13', () => {
    render(
      <AnsweredQuestions
        interaction={{ malformed: false, questions: [] }}
        answers={null}
        end="unknown"
        summary="The user answered: tone=dry"
      />,
    );

    expect(screen.getByText(t('permission.question.answeredElsewhere'))).toBeInTheDocument();
    expect(screen.getByText('The user answered: tone=dry')).toBeInTheDocument();
  });

  it('says nothing of a summary that is empty', () => {
    const { container } = render(
      <AnsweredQuestions
        interaction={{ malformed: false, questions: [] }}
        answers={null}
        end="unknown"
        summary=""
      />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
