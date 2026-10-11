import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { kindShortName } from '@/shared/lib/tool-label';
import type { PermissionRule, RowFailure } from '../types/rule';

export interface RuleRowProps {
  readonly rule: PermissionRule;
  readonly expiringSoon: boolean;
  readonly busy: boolean;

  /** Why the last revocation of this rule did not happen, when it did not. */
  readonly failure: RowFailure | null;

  onRevoke(ruleId: string): void;
}

/**
 * One rule: how far it reaches, who granted it, until when — and the way to take it back.
 *
 * Every field the architecture lists is on the row, in words and not in a code
 * (docs/architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada):
 *
 * - **scope and pattern together**, the pattern exactly as granted and monospaced. `always` is, in
 *   practice, "don't ask me again", and the reach has to be read in full. The pattern is the server's
 *   canonical text, shown and never parsed; the kind beside it is said by its short name;
 * - **a disabled rule says so, and why.** One written for an agent in a form this version could not
 *   carry over keeps its old pattern, answers nothing, and offers only to be revoked (plan 28, D-18);
 * - **the validity, with a warning when it is close.** Without it the session starts asking again
 *   with no explanation;
 * - **an expired rule is marked, not hidden.** "Gone" and "no longer valid" are different things.
 *
 * Revoking is **direct**, with no dialogue in front of it: the promise of the plan is that taking
 * an authorisation back is one click away, and a confirmation would make it two. It is also the
 * safe direction — the worst a stray revoke does is make the agent ask again. What protects it from
 * a double click is that a row being revoked takes no second one.
 */
export function RuleRow({
  rule,
  expiringSoon,
  busy,
  failure,
  onRevoke,
}: RuleRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const date = useMediumDate();
  // Only ever on the screen of one rule: the list leaves a revoked rule out. It has nothing left to
  // take back, so it offers nothing.
  const revoked = rule.status === 'revoked';

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-border p-4 ${rule.status === 'active' ? '' : 'opacity-70'}`}
      aria-label={t('rules.row.label', { pattern: rule.pattern })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{t(`rules.scope.${rule.scope}`)}</span>
        <span className="text-xs font-medium" data-testid={`rule-status-${rule.id}`}>
          {t(`rules.status.${rule.status}`)}
        </span>
      </div>

      <RuleReach rule={rule} />

      {rule.projectPath !== null && (
        <span className="font-mono text-xs text-muted-foreground">
          {t('rules.row.project', { path: rule.projectPath })}
        </span>
      )}

      <span className="text-xs text-muted-foreground">
        {t('rules.row.granted', { who: rule.grantedBy, at: date(rule.grantedAt) })}
      </span>

      <RuleValidity rule={rule} expiringSoon={expiringSoon} />

      {!revoked && (
        <Button
          variant="outline"
          size="touch"
          disabled={busy}
          onClick={() => {
            onRevoke(rule.id);
          }}
        >
          {busy ? t('rules.action.revoking') : t('rules.action.revoke')}
        </Button>
      )}

      {failure !== null && (
        <p className="text-xs text-destructive" role="alert">
          {t(failure.messageKey, failure.params)}
        </p>
      )}
    </li>
  );
}

/** A date as a row writes it, in the language of the screen. */
function useMediumDate(): (iso: string) => string {
  const { i18n } = useTranslation();

  return (iso) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * What the rule answers: the short name of its kind and its decision, then the pattern as the server
 * wrote it. A disabled rule has no kind and answers nothing — it says why instead, naming the agent
 * it was written for.
 */
function RuleReach({ rule }: { readonly rule: PermissionRule }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      {rule.status !== 'disabled' && (
        <span className="text-xs text-muted-foreground">
          {t('rules.row.toolDecision', {
            tool: kindShortName(rule.kind, t),
            decision: t(`rules.decision.${rule.decision}`),
          })}
        </span>
      )}

      <pre className="overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
        {rule.pattern}
      </pre>

      {rule.disabled !== null && (
        <p className="text-xs font-medium" role="note">
          {t('rules.row.disabled', { engine: rule.engine })}
        </p>
      )}
    </>
  );
}

/**
 * Until when the rule answers: revoked on a day, expired on a day, valid until a day — with the
 * warning when that day is close. A disabled rule answers nothing, so it has no validity to count.
 */
function RuleValidity({
  rule,
  expiringSoon,
}: {
  readonly rule: PermissionRule;
  readonly expiringSoon: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const date = useMediumDate();

  if (rule.revokedAt !== null) {
    return (
      <p className="text-xs font-medium" role="note">
        {t('rules.row.revokedOn', { at: date(rule.revokedAt) })}
      </p>
    );
  }

  if (rule.status === 'disabled') {
    return null;
  }

  return (
    <>
      <span className="text-xs text-muted-foreground">
        {rule.status === 'expired'
          ? t('rules.row.expiredOn', { at: date(rule.expiresAt) })
          : t('rules.row.validUntil', { at: date(rule.expiresAt) })}
      </span>

      {expiringSoon && (
        <p className="text-xs font-medium text-destructive" role="note">
          {t('rules.row.expiringSoon', { at: date(rule.expiresAt) })}
        </p>
      )}
    </>
  );
}
