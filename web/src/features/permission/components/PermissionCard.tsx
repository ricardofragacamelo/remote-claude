import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionScope,
  ScopeSuggestion,
} from '../types/permission';

export interface PermissionCardProps {
  readonly request: PermissionRequest;

  /** Milliseconds left before the deadline refuses it. */
  readonly remainingMs: number;

  onAnswer(request: PermissionRequest, decision: PermissionDecision, scope: PermissionScope): void;
  onExtend(request: PermissionRequest): void;

  /** Where the rules are revoked. Absent, the second step says so without offering the way. */
  onOpenRules?: (() => void) | undefined;
}

/** The emphasis each risk gets. A token per role, never a literal shade. */
const RISK_STYLE = {
  read: 'border-border',
  write: 'border-border',
  destructive: 'border-destructive',
} as const;

/**
 * One question, and the two answers to it.
 *
 * Three things here are rules rather than decoration:
 *
 * - **the command is shown exactly, monospaced and scrollable.** Somebody is watching this run on
 *   their own machine; truncating the command hides the one thing that matters;
 * - **refusal is what the card leans towards**, because the server says so and because silence
 *   refuses anyway;
 * - **a card that is answering takes no second click.** Two clicks are two answers;
 * - **a yes that outlives the session takes a second step**, whatever the risk. `project` and
 *   `always` mean "don't ask me again", and the second step is where that is said in full — the
 *   pattern, where it holds, for how long — with the way to the rules that take it back
 *   ([D-14](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export function PermissionCard({
  request,
  remainingMs,
  onAnswer,
  onExtend,
  onOpenRules,
}: PermissionCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const seconds = Math.ceil(remainingMs / 1_000);
  const [armed, setArmed] = useState<ScopeSuggestion | null>(null);

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border-2 p-4 ${RISK_STYLE[request.riskHint]}`}
      aria-label={t('permission.card.label', { tool: request.toolName })}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {/*
            The key is built from the tool name rather than read out of a variable, and the two
            reasons are the same reason: this build has words for the tools it knows and a fallback
            for the rest, and `pnpm i18n:check` can only see a family it can read in the source. A
            key it cannot see is a key somebody deletes.
          */}
          {t(`permission.tool.${request.toolName}`, {
            defaultValue: t('permission.tool.unknown', { tool: request.toolName }),
          })}
        </h3>
        <span className="text-xs opacity-70" role="timer">
          {t('permission.card.remaining', { seconds })}
        </span>
      </div>

      <p className="text-xs uppercase opacity-70">{t(`permission.risk.${request.riskHint}`)}</p>

      {request.description !== null && (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
          {request.description}
        </pre>
      )}

      {armed === null ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="touch"
            disabled={request.isAnswering}
            onClick={() => {
              onAnswer(request, 'deny', 'once');
            }}
          >
            {t('permission.card.deny')}
          </Button>

          {request.suggestions.map((suggestion) => (
            <Button
              key={suggestion.scope}
              variant={suggestion.scope === 'once' ? 'primary' : 'outline'}
              size="touch"
              disabled={request.isAnswering}
              onClick={() => {
                if (suggestion.rule === null) {
                  onAnswer(request, 'allow', suggestion.scope);
                } else {
                  setArmed(suggestion);
                }
              }}
            >
              {t(suggestion.labelKey)}
            </Button>
          ))}

          <Button
            variant="outline"
            size="touch"
            disabled={request.isAnswering}
            onClick={() => {
              onExtend(request);
            }}
          >
            {t('permission.card.extend')}
          </Button>
        </div>
      ) : (
        <PersistConfirmation
          suggestion={armed}
          disabled={request.isAnswering}
          onConfirm={() => {
            onAnswer(request, 'allow', armed.scope);
          }}
          onBack={() => {
            setArmed(null);
          }}
          onOpenRules={onOpenRules}
        />
      )}

      {request.isAnswering && <p className="text-xs opacity-70">{t('permission.card.sending')}</p>}
    </li>
  );
}

interface PersistConfirmationProps {
  readonly suggestion: ScopeSuggestion;
  readonly disabled: boolean;
  onConfirm(): void;
  onBack(): void;
  onOpenRules?: (() => void) | undefined;
}

/** A day, for the one sentence that turns a lifetime into something a person reads. */
const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;

/**
 * The second step of a yes that outlives the session: what it reaches, in full.
 *
 * No euphemism and no acronym (S-17): which command, where, and for how long — the pattern exactly
 * as it will be stored, monospaced, because a rule that reads differently from how it matches is
 * the one kind a permission system must never show.
 *
 * The focus goes to the way back, as on the devices screen: the accident this step exists for is
 * one stray Enter.
 */
function PersistConfirmation({
  suggestion,
  disabled,
  onConfirm,
  onBack,
  onOpenRules,
}: PersistConfirmationProps): React.JSX.Element {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  const rule = suggestion.rule;
  const lifetimeMs = rule?.lifetimeMs ?? 0;
  const duration =
    lifetimeMs >= DAY_MS
      ? t('permission.persist.days', { days: Math.round(lifetimeMs / DAY_MS) })
      : t('permission.persist.hours', { hours: Math.max(1, Math.round(lifetimeMs / HOUR_MS)) });

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <div
      role="group"
      aria-label={t('permission.persist.title')}
      className="flex flex-col gap-2 rounded border border-border p-3"
    >
      <p className="text-sm font-semibold">{t('permission.persist.title')}</p>
      <p className="text-sm">
        {suggestion.scope === 'always'
          ? t('permission.persist.always', { duration })
          : t('permission.persist.project', { duration })}
      </p>
      <pre className="overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
        {rule?.pattern}
      </pre>
      <p className="text-xs opacity-70">{t('permission.persist.revocable')}</p>

      <div className="flex flex-wrap gap-2">
        {/* First in the DOM, and so first in the tab order: the way back, not the grant. */}
        <Button ref={backRef} variant="primary" size="touch" onClick={onBack}>
          {t('permission.persist.back')}
        </Button>
        <Button variant="outline" size="touch" disabled={disabled} onClick={onConfirm}>
          {t('permission.persist.confirm')}
        </Button>
        {onOpenRules !== undefined && (
          <Button variant="outline" size="touch" onClick={onOpenRules}>
            {t('permission.persist.openRules')}
          </Button>
        )}
      </div>
    </div>
  );
}
