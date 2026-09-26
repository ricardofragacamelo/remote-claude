import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { AuditEntry, AuditVerdict } from '../types/audit';

export interface AuditEntryRowProps {
  readonly entry: AuditEntry;

  /** Opens the rule that answered — one of the two ways in to the rules that D-04 requires. */
  onOpenRule(ruleId: string): void;

  /** Narrows the trail to this entry's session. */
  onShowSession(sessionId: string): void;
}

/** A rule the product stored, and can therefore open: one that outlives its session. */
function isStoredRule(verdict: AuditVerdict): verdict is AuditVerdict & { ruleId: string } {
  return verdict.ruleId !== null && (verdict.scope === 'project' || verdict.scope === 'always');
}

/**
 * One entry: what ran, when, and — the reason the trail exists — who let it.
 *
 * The explanation is in words, one sentence per way a decision can have been taken
 * (docs/architecture/web/03-ui-system.md#trilha-de-auditoria):
 *
 * - **a stored rule answered** — and the rule opens from here, even after it was revoked, because
 *   the next thing somebody does on finding a command that ran unasked is look at what let it;
 * - **a `session` rule answered** — which was never stored and ended with its session, so there is
 *   nothing to open, and the row says so instead of offering a link to an empty page (S-75);
 * - **nobody answered in time**, and silence refused it (S-79);
 * - **a person answered**, and it says who and from where (S-79).
 *
 * The input is shown exactly, monospaced, in the detail. It is what ran on somebody's machine.
 */
export function AuditEntryRow({
  entry,
  onOpenRule,
  onShowSession,
}: AuditEntryRowProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(entry.at));
  const tool = t(`permission.tool.${entry.toolName}`, {
    defaultValue: t('permission.tool.unknown', { tool: entry.toolName }),
  });
  const verdict = entry.verdict;

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
      aria-label={t('audit.row.label', { tool, at: when })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{tool}</span>
        <span className="text-xs font-medium" data-testid={`audit-decision-${entry.id}`}>
          {t(`audit.decision.${entry.decision}`)}
        </span>
      </div>

      <span className="text-xs text-muted-foreground">{when}</span>

      {verdict?.auto === true && (
        <span className="text-xs font-medium text-destructive">{t('audit.row.unasked')}</span>
      )}

      <p className="text-sm">{explanation(entry, t)}</p>

      {verdict !== null && isStoredRule(verdict) && (
        <Button
          variant="outline"
          size="touch"
          onClick={() => {
            onOpenRule(verdict.ruleId);
          }}
        >
          {t('audit.row.openRule')}
        </Button>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer">{t('audit.row.details')}</summary>
        <pre className="mt-2 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap">
          {JSON.stringify(entry.input, null, 2)}
        </pre>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt>{t('audit.row.session')}</dt>
          <dd className="font-mono break-all">{entry.sessionId}</dd>
          <dt>{t('audit.row.trace')}</dt>
          <dd className="font-mono break-all">{entry.traceId ?? t('audit.row.noTrace')}</dd>
          {verdict !== null && (
            <>
              <dt>{t('audit.row.request')}</dt>
              <dd className="font-mono break-all">{verdict.requestId}</dd>
            </>
          )}
        </dl>
        <Button
          className="mt-2"
          variant="outline"
          onClick={() => {
            onShowSession(entry.sessionId);
          }}
        >
          {t('audit.row.onlyThisSession')}
        </Button>
      </details>
    </li>
  );
}

/** The one sentence that says how this entry came to be. */
function explanation(entry: AuditEntry, t: TFunction): string {
  const verdict = entry.verdict;

  if (entry.decision === 'recorded') {
    return t('audit.verdict.recorded');
  }

  if (verdict === null) {
    return t('audit.verdict.unknown');
  }

  const decision = t(`audit.decision.${entry.decision}`);

  if (verdict.auto && verdict.ruleId !== null) {
    return isStoredRule(verdict)
      ? t('audit.verdict.byRule', { decision, scope: t(`rules.scope.${verdict.scope}`) })
      : t('audit.verdict.bySessionRule', { decision });
  }

  if (verdict.auto) {
    return t('audit.verdict.nobodyAnswered');
  }

  return t('audit.verdict.byPerson', {
    decision,
    who: verdict.resolvedBy ?? t('audit.verdict.somebody'),
    from: t(`audit.origin.${verdict.resolvedFrom ?? 'unknown'}`),
  });
}
