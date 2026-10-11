import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionSetPermissionModePayload } from '@remote-claude/contracts';

import { Button } from '@/shared/components/ui/button';
import { PermissionCountdown } from './PermissionCountdown';
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionScope,
  PlanInteraction,
} from '../types/permission';

/** The renderer of markdown, on demand — never in the first chunk of the page. */
const Markdown = lazy(() =>
  import('@/shared/components/markdown/Markdown').then((module) => ({ default: module.Markdown })),
);

/** A canonical mode a session can go on in (plan 28, D-16). */
export type PlanMode = SessionSetPermissionModePayload['mode'];

/**
 * What an approved plan can go on doing, and what each is called: asking before each edit, or
 * accepting edits — each only when the engine announces it (plan 28, B-27). Never read-only, which
 * is where a plan is made, nor Permitir tudo, which is chosen only from the chip, with its warning in
 * sight.
 */
const NEXT_MODES = {
  ask: 'permission.planMode.ask',
  acceptEdits: 'permission.planMode.acceptEdits',
} as const satisfies Partial<Record<PlanMode, string>>;
type NextMode = keyof typeof NEXT_MODES;

/** The modes the card offers: the engine's, in its order, that a plan can go on in. */
function nextModesOf(announced: readonly PlanMode[]): readonly NextMode[] {
  return announced.filter((mode): mode is NextMode => mode in NEXT_MODES);
}

export interface PlanApprovalCardProps {
  readonly request: PermissionRequest;

  /** The plan the request carries. */
  readonly plan: PlanInteraction;
  readonly remainingMs: number;
  onAnswer(
    request: PermissionRequest,
    decision: PermissionDecision,
    scope: PermissionScope,
    reason?: string,
  ): void;

  /**
   * The modes the session's engine announces — the card offers the ones a plan can go on in. Absent
   * while they are not known, and then it offers both.
   */
  readonly modes?: readonly PlanMode[] | null | undefined;

  /** The plan was approved: the session goes on in this mode — not called with none to go on in. */
  onApproved?: ((mode: PlanMode) => void) | undefined;
}

/**
 * In plan mode, the agent presents its plan, and the question is this card (plan 08, B-22): the plan,
 * in markdown — the request's interaction of kind `plan`, never the tool's input (plan 28, B-20) —,
 * and two ways out — **approve**, which allows it and changes the mode to the one chosen, and **keep
 * planning**, which refuses it with what the person wrote as the reason, the reason that goes back
 * to the agent (S-92…S-94). It is the same `permission.resolve`, so a plan approved on another device
 * settles this card too, with no second answer (S-95).
 */
export function PlanApprovalCard({
  request,
  plan,
  remainingMs,
  modes,
  onAnswer,
  onApproved,
}: PlanApprovalCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const offered = nextModesOf(modes ?? (Object.keys(NEXT_MODES) as NextMode[]));
  const [picked, setMode] = useState<NextMode | null>(null);
  const mode = offered.find((each) => each === picked) ?? offered[0] ?? null;
  const [comment, setComment] = useState('');
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
        <PermissionCountdown remainingMs={remainingMs} />
      </div>

      <div className="max-h-96 overflow-auto rounded bg-muted p-3">
        <Suspense fallback={<p className="whitespace-pre-wrap">{plan.markdown}</p>}>
          <Markdown source={plan.markdown} />
        </Suspense>
      </div>

      {offered.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-semibold">{t('permission.plan.modeLegend')}</legend>
          {offered.map((each) => (
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
              {t(NEXT_MODES[each])}
            </label>
          ))}
        </fieldset>
      )}

      <Button
        disabled={request.isAnswering}
        onClick={() => {
          onAnswer(request, 'allow', 'once');
          if (mode !== null) {
            onApproved?.(mode);
          }
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
