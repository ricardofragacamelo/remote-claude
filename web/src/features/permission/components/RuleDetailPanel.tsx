import { ClipboardCopy, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionRuleFinding } from '@remote-claude/contracts';

import { IconButton } from '@/shared/components/IconButton';
import { LearnMore } from '@/shared/components/LearnMore';
import { LoadMore } from '@/shared/components/LoadMore';
import { ListStatus } from '@/shared/components/ListStatus';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { Button } from '@/shared/components/ui/button';
import { useClock } from '@/shared/hooks/useClock';
import { useCopy } from '@/shared/hooks/useCopy';
import { kindShortName } from '@/shared/lib/tool-label';
import type { Load } from '@/shared/hooks/useLoad';
import { useRule } from '../hooks/useRule';
import { useRuleHistory } from '../hooks/useRuleHistory';
import { useRuleInvocations } from '../hooks/useRuleInvocations';
import { useRuleMutations } from '../hooks/useRuleMutations';
import type { RuleMutationFailure } from '../hooks/useRuleMutations';
import { isExpiringSoon } from '../lib/listed-rule';
import { ruleHistoryLabelKey } from '../lib/rule-history-label';
import { ruleInvocationLabel } from '../lib/rule-invocation-label';
import { ruleOrigin } from '../lib/rule-origin';
import { ruleSentence } from '../lib/rule-sentence';
import type { PermissionRule, RuleStatus } from '../types/rule';
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleExpiryDialog } from './RuleExpiryDialog';
import { RuleFailureMessage } from './RuleFailureMessage';
import { RuleLastUsedCell, RuleUsageCell, RuleValidityCell } from './RuleValidityCell';
import { SimulationPanel } from './SimulationPanel';

export interface RuleDetailPanelProps {
  readonly ruleId: string;
  onClose(): void;
  onOpenRule(ruleId: string): void;

  /**
   * Opens the trail filtered by this rule — the same destination for every invocation today, until
   * [plan 14](../../../../../docs/plans/14-audit-explained/README.md) can take one to the exact
   * invocation it names instead (S-165).
   */
  onShowTrail(): void;

  /** Opens the wizard pre-filled with this rule's own fields — the convenience D-01 names
   * "editar o padrão" (B-30). */
  onDuplicate(rule: PermissionRule): void;
}

/** `restore:<id>` — the exact guard key `useRuleMutations.restoreBatch` keys a lot of one rule by. */
function restoreKeyOf(ruleId: string): string {
  return `restore:${ruleId}`;
}

/**
 * [written] over whatever full read this panel already had, never in its place: a write route
 * (shorten/extend, revoke) answers the bare rule, never `usage`/`findings`/`folderReachable`/
 * `expiryCeiling` — those are the describe route's own expense (plan 15, B-22/B-23), not repeated
 * on every write — and replacing the rule wholesale with that answer would lose them, crashing the
 * validity dialog on a date it can no longer read. `current` is never anything but `ready` by the
 * time a write resolves — the buttons a write answers are themselves only ever shown once it is.
 */
function mergedWith(current: Load<PermissionRule>, written: PermissionRule): PermissionRule {
  return current.status === 'ready' ? { ...current.value, ...written } : written;
}

/**
 * One rule, whatever became of it — the panel that opens over the list (S-222), from the rules
 * screen's own row or from the audit trail's entry it answered (D-04).
 */
export function RuleDetailPanel({
  ruleId,
  onClose,
  onOpenRule,
  onShowTrail,
  onDuplicate,
}: RuleDetailPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { load, isLoading, error, setLoad, reload } = useRule(ruleId);
  const { revoke, restoreBatch, inFlight, failure } = useRuleMutations();
  const now = useClock(false);
  const rule = load.status === 'ready' ? load.value : null;
  const sentence = rule === null ? null : ruleSentence(rule, i18n.language, t);
  const [expiryDialog, setExpiryDialog] = useState<'shorten' | 'extend' | null>(null);

  const onRuleChanged = (changed: PermissionRule): void => {
    setLoad((current) => ({ status: 'ready', value: mergedWith(current, changed) }));
  };

  const onRevoke = (): void => {
    void revoke(ruleId)
      .then((revoked) => {
        setLoad((current) => ({ status: 'ready', value: mergedWith(current, revoked) }));
      })
      .catch(() => {});
  };

  const onRestore = (): void => {
    void restoreBatch([ruleId])
      .then(() => reload())
      .catch(() => {});
  };

  return (
    <div
      className="flex h-full flex-col gap-4 overflow-y-auto"
      aria-label={t('permission.ruleDetail.label')}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ui font-ui-strong">{t('permission.ruleDetail.title')}</h2>
        <IconButton icon={X} label={t('permission.ruleDetail.close')} onClick={onClose} />
      </div>

      <LoadStatus
        isLoading={isLoading}
        loadingLabel={t('rules.detail.loading')}
        error={error}
        onRetry={reload}
      />

      {rule !== null && (
        <>
          <RuleHeaderFacts rule={rule} sentence={sentence} />
          <RuleAlerts findings={rule.findings} onOpenRule={onOpenRule} />

          <section>
            <h3 className="text-ui-sm font-ui-strong">
              {t('permission.ruleDetail.validityTitle')}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <RuleValidityCell rule={rule} expiringSoon={isExpiringSoon(rule, now)} now={now} />
              {rule.status === 'active' && (
                <>
                  <Button
                    variant="outline"
                    size="touch"
                    onClick={() => {
                      setExpiryDialog('shorten');
                    }}
                  >
                    {t('permission.ruleExpiry.shortenTitle')}
                  </Button>
                  <Button
                    variant="outline"
                    size="touch"
                    onClick={() => {
                      setExpiryDialog('extend');
                    }}
                  >
                    {t('permission.ruleExpiry.extendTitle')}
                  </Button>
                </>
              )}
            </div>
          </section>

          <RuleExpiryDialog
            key={expiryDialog ?? 'shorten'}
            rule={rule}
            direction={expiryDialog ?? 'shorten'}
            open={expiryDialog !== null}
            onOpenChange={(open) => {
              if (!open) {
                setExpiryDialog(null);
              }
            }}
            onChanged={onRuleChanged}
          />

          <section>
            <h3 className="text-ui-sm font-ui-strong">{t('permission.ruleDetail.usageTitle')}</h3>
            <div className="flex flex-wrap gap-2 text-ui-sm">
              <RuleUsageCell rule={rule} />
              <RuleLastUsedCell rule={rule} now={now} />
            </div>
            <RuleInvocationsList ruleId={ruleId} onShowTrail={onShowTrail} />
          </section>

          <section>
            <h3 className="text-ui-sm font-ui-strong">{t('permission.ruleDetail.originTitle')}</h3>
            <p className="text-ui-sm">{ruleOrigin(rule, i18n.language, t)}</p>
          </section>

          <RuleHistorySection ruleId={ruleId} locale={i18n.language} />

          {rule.status === 'active' && (
            <details className="rounded-md border p-2">
              <summary className="cursor-pointer text-ui-sm font-ui-strong">
                {t('rules.simulate.revokeHeading')}
              </summary>
              <div className="mt-3">
                <SimulationPanel remove={[ruleId]} onOpenRule={onOpenRule} />
              </div>
            </details>
          )}

          <RuleActions
            rule={rule}
            ruleId={ruleId}
            inFlight={inFlight}
            failure={failure}
            onRevoke={onRevoke}
            onRestore={onRestore}
            onDuplicate={() => {
              onDuplicate(rule);
            }}
          />
        </>
      )}
    </div>
  );
}

function RuleHeaderFacts({
  rule,
  sentence,
}: {
  readonly rule: PermissionRule;
  readonly sentence: string | null;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <RuleDecisionChip decision={rule.decision} />
        <span>{kindShortName(rule.kind, t)}</span>
        <code className="font-mono text-ui-sm">{rule.pattern}</code>
      </div>

      {rule.status === 'disabled' && rule.disabledReason != null && (
        <p className="text-ui-sm" role="note">
          {t(rule.disabledReason.messageKey, rule.disabledReason.params)}
        </p>
      )}

      {sentence !== null && (
        <p className="flex flex-wrap items-center gap-2 text-ui-sm">
          {sentence}
          <LearnMore section="rules-pattern" topic={t('rules.help.patternHeading')} />
        </p>
      )}
    </>
  );
}

/** Shared with the rule-authoring wizard's own review step (plan 15, B-27): the same finding, the
 * same "open the involved rule" link, whether it is read from a stored rule or a draft's preview. */
export function RuleAlerts({
  findings,
  onOpenRule,
}: {
  readonly findings: readonly PermissionRuleFinding[] | undefined;
  onOpenRule(ruleId: string): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (findings === undefined || findings.length === 0) {
    return null;
  }

  return (
    <section aria-label={t('permission.ruleDetail.alertsTitle')}>
      <h3 className="text-ui-sm font-ui-strong">{t('permission.ruleDetail.alertsTitle')}</h3>
      <ul className="flex flex-col gap-1">
        {findings.map((finding, index) => (
          <FindingItem
            // A finding has no id of its own on the wire — its position in a stable,
            // server-ordered array is the only thing that tells two of the same kind apart.
            key={`${finding.kind}-${index}`}
            finding={finding}
            onOpenRule={onOpenRule}
          />
        ))}
      </ul>
    </section>
  );
}

function RuleActions({
  rule,
  ruleId,
  inFlight,
  failure,
  onRevoke,
  onRestore,
  onDuplicate,
}: {
  readonly rule: PermissionRule;
  readonly ruleId: string;
  readonly inFlight: ReadonlySet<string>;
  readonly failure: RuleMutationFailure | null;
  onRevoke(): void;
  onRestore(): void;
  onDuplicate(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const restoreKey = restoreKeyOf(ruleId);
  const isFailureForThisRule = failure?.ruleId === ruleId || failure?.ruleId === restoreKey;

  return (
    <>
      <div className="flex gap-2">
        {rule.status !== 'revoked' && rule.status !== 'disabled' && (
          <Button variant="outline" size="touch" disabled={inFlight.has(ruleId)} onClick={onRevoke}>
            {inFlight.has(ruleId) ? t('rules.action.revoking') : t('rules.action.revoke')}
          </Button>
        )}
        {rule.status === 'revoked' && (
          <Button
            variant="outline"
            size="touch"
            disabled={inFlight.has(restoreKey)}
            onClick={onRestore}
          >
            {t('permission.ruleDetail.restore')}
          </Button>
        )}
        <DuplicateButton status={rule.status} onDuplicate={onDuplicate} />
      </div>

      {isFailureForThisRule && failure !== null && (
        <RuleFailureMessage messageKey={failure.error.messageKey} params={failure.error.params} />
      )}
    </>
  );
}

/** Every status but `disabled` — its pattern never translated back, nothing to duplicate (B-30). */
function DuplicateButton({
  status,
  onDuplicate,
}: {
  readonly status: RuleStatus;
  onDuplicate(): void;
}): React.JSX.Element | null {
  const { t } = useTranslation();

  if (status === 'disabled') {
    return null;
  }

  return (
    <Button variant="outline" size="touch" onClick={onDuplicate}>
      {t('permission.ruleDetail.duplicate')}
    </Button>
  );
}

function FindingItem({
  finding,
  onOpenRule,
}: {
  readonly finding: PermissionRuleFinding;
  onOpenRule(ruleId: string): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const other = finding.ruleIds[0];

  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-ui-xs">
      <span>{t(finding.messageKey, finding.params)}</span>
      {other !== undefined && (
        <Button
          variant="outline"
          size="touch"
          onClick={() => {
            onOpenRule(other);
          }}
        >
          {t('permission.ruleDetail.openInvolvedRule')}
        </Button>
      )}
    </li>
  );
}

function RuleInvocationsList({
  ruleId,
  onShowTrail,
}: {
  readonly ruleId: string;
  onShowTrail(): void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { invocations, isLoading, error, hasMore, isLoadingMore, moreError, loadMore, reload } =
    useRuleInvocations(ruleId);

  return (
    <div className="flex flex-col gap-1">
      <ListStatus
        isLoading={isLoading}
        loadingLabel={t('permission.ruleDetail.invocationsLoading')}
        error={error}
        onRetry={reload}
        isEmpty={invocations.length === 0}
        emptyTitle={t('permission.ruleDetail.invocationsEmptyTitle')}
        emptyDescription={t('permission.ruleDetail.invocationsEmptyDescription')}
      />
      {invocations.length > 0 && (
        <ul
          className="flex flex-col gap-1"
          aria-label={t('permission.ruleDetail.invocationsTitle')}
        >
          {invocations.map((invocation) => (
            <li key={invocation.id} className="flex items-center justify-between gap-2 text-ui-xs">
              <span>{ruleInvocationLabel(invocation, i18n.language, t)}</span>
              <Button variant="outline" size="touch" onClick={onShowTrail}>
                {t('permission.ruleDetail.showTrail')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        hasMore={hasMore}
        isLoading={isLoadingMore}
        error={moreError}
        onLoadMore={loadMore}
        label={t('permission.ruleDetail.invocationsLoadMore')}
        loadingLabel={t('rules.table.loadingMore')}
      />
    </div>
  );
}

function RuleHistorySection({
  ruleId,
  locale,
}: {
  readonly ruleId: string;
  readonly locale: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { load, isLoading, error, reload } = useRuleHistory(ruleId);
  const events = load.status === 'ready' ? load.value.events : [];

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ui-sm font-ui-strong">{t('permission.ruleDetail.historyTitle')}</h3>
        <RuleIdLine ruleId={ruleId} />
      </div>
      <ListStatus
        isLoading={isLoading}
        loadingLabel={t('permission.ruleDetail.historyLoading')}
        error={error}
        onRetry={reload}
        isEmpty={events.length === 0}
        emptyTitle={t('permission.ruleDetail.historyEmptyTitle')}
        emptyDescription={t('permission.ruleDetail.historyEmptyDescription')}
      />
      {events.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={t('permission.ruleDetail.historyTitle')}>
          {events.map((event) => (
            <li key={event.id} className="flex items-center gap-2 text-ui-xs">
              <span>{t(ruleHistoryLabelKey(event.kind))}</span>
              <span className="text-muted-foreground">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(event.at))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The id, truncated, with a button to copy it in full — the same affordance `RulePatternCell` gives the pattern. */
function RuleIdLine({ ruleId }: { readonly ruleId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy(ruleId);

  return (
    <span className="flex items-center gap-1 text-ui-xs text-muted-foreground">
      <code className="max-w-[12ch] truncate font-mono">{ruleId}</code>
      <IconButton
        icon={ClipboardCopy}
        label={t('permission.ruleDetail.copyId')}
        onClick={() => {
          copy.copy();
        }}
      />
    </span>
  );
}
