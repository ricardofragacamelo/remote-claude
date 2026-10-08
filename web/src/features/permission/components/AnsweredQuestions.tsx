import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import type { Question, QuestionAnswer, QuestionInteraction } from '../types/permission';

/**
 * How a question ended, as far as this screen knows: answered, refused, out of time — or answered
 * where we kept no record of it, a session of another client (plan 24, D-13).
 */
export type QuestionEnd = 'answered' | 'declined' | 'expired' | 'unknown';

export interface AnsweredQuestionsProps {
  readonly interaction: QuestionInteraction;
  readonly answers: readonly QuestionAnswer[] | null;
  readonly end: QuestionEnd;

  /** Why it was refused, on `declined`. */
  readonly reason?: string | null;

  /** What the CLI said, when there is no record of the answers. */
  readonly summary?: string | null;
}

/**
 * A question of Claude, once it is over — read-only (plan 24, B-15): each question with the option
 * chosen marked, the others faded, and the free answer in words. Refused, it says why; out of time,
 * that nothing was sent. Of a session answered elsewhere, the questions and what the CLI said.
 */
export function AnsweredQuestions({
  interaction,
  answers,
  end,
  reason = null,
  summary = null,
}: AnsweredQuestionsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div data-answered-questions={end} className="flex flex-col gap-2 text-sm">
      {end === 'declined' && (
        <p className="text-xs text-destructive">
          {t('permission.question.declined', { reason: reason ?? '' })}
        </p>
      )}
      {end === 'expired' && (
        <p className="text-xs opacity-70">{t('permission.question.expired')}</p>
      )}
      {end === 'unknown' && (
        <p className="text-xs opacity-70">{t('permission.question.answeredElsewhere')}</p>
      )}
      <ol className="flex flex-col gap-2">
        {interaction.questions.map((question) => (
          <AnsweredQuestion
            key={question.id}
            question={question}
            answer={answers?.find((each) => each.questionId === question.id) ?? null}
          />
        ))}
      </ol>
      {end === 'unknown' && summary !== null && summary !== '' && (
        <p className="text-xs whitespace-pre-wrap opacity-70">{summary}</p>
      )}
    </div>
  );
}

/** One question: its header and text, and its options — the chosen ones marked, the rest faded. */
function AnsweredQuestion({
  question,
  answer,
}: {
  readonly question: Question;
  readonly answer: QuestionAnswer | null;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <li className="flex flex-col gap-1">
      <p className="text-xs">
        {question.header !== '' && (
          <span className="mr-2 rounded-full border border-border px-2">{question.header}</span>
        )}
        {question.prompt}
      </p>
      <ul className="flex flex-col gap-0.5 pl-2">
        {question.options.map((option) => {
          const chosen = answer?.selected.includes(option.label) === true;

          return (
            <li
              key={option.label}
              aria-current={chosen || undefined}
              className={cn('flex items-center gap-1.5', chosen ? 'font-medium' : 'opacity-50')}
            >
              <Check className={cn('size-3.5 shrink-0', !chosen && 'invisible')} aria-hidden />
              {option.label}
            </li>
          );
        })}
        {answer?.other != null && (
          <li aria-current className="flex items-center gap-1.5 font-medium">
            <Check className="size-3.5 shrink-0" aria-hidden />
            {t('permission.question.otherAnswer', { text: answer.other })}
          </li>
        )}
      </ul>
    </li>
  );
}
