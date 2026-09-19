import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { PermissionDecision, PermissionRequest, PermissionScope } from '../types/permission';

export interface PermissionCardProps {
  readonly request: PermissionRequest;

  /** Milliseconds left before the deadline refuses it. */
  readonly remainingMs: number;

  onAnswer(request: PermissionRequest, decision: PermissionDecision, scope: PermissionScope): void;
  onExtend(request: PermissionRequest): void;
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
 * - **a card that is answering takes no second click.** Two clicks are two answers.
 */
export function PermissionCard({
  request,
  remainingMs,
  onAnswer,
  onExtend,
}: PermissionCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const seconds = Math.ceil(remainingMs / 1_000);

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
              onAnswer(request, 'allow', suggestion.scope);
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

      {request.isAnswering && <p className="text-xs opacity-70">{t('permission.card.sending')}</p>}
    </li>
  );
}
