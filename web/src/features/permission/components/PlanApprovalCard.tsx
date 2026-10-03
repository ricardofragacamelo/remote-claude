import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { PermissionDecision, PermissionRequest, PermissionScope } from '../types/permission';

/** The renderer of markdown, on demand — never in the first chunk of the page. */
const Markdown = lazy(() =>
  import('@/shared/components/markdown/Markdown').then((module) => ({ default: module.Markdown })),
);

/** The modes an approved plan can go on in: asking for each edit, or accepting edits. */
export const PLAN_MODES = ['default', 'acceptEdits'] as const;
export type PlanMode = (typeof PLAN_MODES)[number];

export interface PlanApprovalCardProps {
  readonly request: PermissionRequest;
  readonly remainingMs: number;
  onAnswer(
    request: PermissionRequest,
    decision: PermissionDecision,
    scope: PermissionScope,
    reason?: string,
  ): void;

  /** The plan was approved: the session goes on in this mode. */
  onApproved?: ((mode: PlanMode) => void) | undefined;
}

/**
 * In plan mode, Claude presents its plan with `ExitPlanMode`, and the question is this card (plan 08,
 * B-22): the plan, in markdown, and two ways out — **approve**, which allows it and changes the mode
 * to the one chosen, and **keep planning**, which refuses it with what the person wrote as the reason,
 * the reason that goes back to Claude (S-92…S-94). It is the same `permission.resolve`, so a plan
 * approved on another device settles this card too, with no second answer (S-95).
 */
export function PlanApprovalCard({
  request,
  remainingMs,
  onAnswer,
  onApproved,
}: PlanApprovalCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PlanMode>('default');
  const [comment, setComment] = useState('');
  const plan = typeof request.input['plan'] === 'string' ? request.input['plan'] : '';
  const commentId = `plan-comment-${request.requestId}`;

  return (
    <li
      data-permission-request={request.requestId}
      tabIndex={-1}
      className="flex flex-col gap-3 rounded-lg border-2 border-border p-4 outline-ring focus-visible:outline-2"
      aria-label={t('permission.plan.label')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('permission.plan.title')}</h3>
        <span className="text-xs opacity-70" role="timer">
          {t('permission.card.remaining', { seconds: Math.ceil(remainingMs / 1_000) })}
        </span>
      </div>

      <div className="max-h-96 overflow-auto rounded bg-muted p-3">
        <Suspense fallback={<p className="whitespace-pre-wrap">{plan}</p>}>
          <Markdown source={plan} />
        </Suspense>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-semibold">{t('permission.plan.modeLegend')}</legend>
        {PLAN_MODES.map((each) => (
          <label key={each} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`plan-mode-${request.requestId}`}
              value={each}
              checked={mode === each}
              onChange={() => {
                setMode(each);
              }}
            />
            {t(`permission.planMode.${each}`)}
          </label>
        ))}
      </fieldset>

      <Button
        disabled={request.isAnswering}
        onClick={() => {
          onAnswer(request, 'allow', 'once');
          onApproved?.(mode);
        }}
      >
        {t('permission.plan.approve')}
      </Button>

      <label htmlFor={commentId} className="text-xs font-semibold">
        {t('permission.plan.commentLabel')}
      </label>
      <textarea
        id={commentId}
        value={comment}
        onChange={(event) => {
          setComment(event.target.value);
        }}
        className="min-h-16 rounded border border-input bg-background p-2 text-sm"
      />
      <Button
        variant="outline"
        disabled={request.isAnswering}
        onClick={() => {
          onAnswer(request, 'deny', 'once', comment);
        }}
      >
        {t('permission.plan.keepPlanning')}
      </Button>
    </li>
  );
}
