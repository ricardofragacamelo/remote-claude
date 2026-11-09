import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { ruleRowElementId } from '../lib/rule-row-actions';
import type { RuleListViewProps } from '../lib/rule-list-view';
// Ordered by where each cell sits on the card, not alphabetically — the same five cells
// `RuleTableRow.tsx` imports for its own columns, read as one coincidental clone by jscpd.
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleFailureMessage } from './RuleFailureMessage';
import { RuleTypeCell } from './RuleTypeCell';
import { RulePatternCell } from './RulePatternCell';
import { RuleFolderCell } from './RuleFolderCell';
import { RuleListFrame } from './RuleListStatus';
import {
  RuleCreatedCell,
  RuleLastUsedCell,
  RuleUsageCell,
  RuleValidityCell,
} from './RuleValidityCell';

export interface RuleCardListProps extends RuleListViewProps {
  onOpen(ruleId: string): void;
  onRevoke(ruleId: string): void;
}

/**
 * The table, as a list of cards below `md` (S-167): the same columns, one under the other, with
 * no horizontal scroll and a 44 px touch target on every control — the pattern wraps instead of
 * truncating, since there is no tooltip a finger can hover.
 */
export function RuleCardList({
  rules,
  now,
  expiringSoon,
  focusedId,
  inFlight,
  failure,
  onOpen,
  onRevoke,
  onKeyDown,
  ...status
}: RuleCardListProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <RuleListFrame {...status} rows={4}>
      <ul
        className="flex flex-col gap-3"
        role="listbox"
        aria-label={t('rules.table.caption')}
        tabIndex={0}
        aria-activedescendant={focusedId === null ? undefined : ruleRowElementId(focusedId)}
        onKeyDown={onKeyDown}
      >
        {rules.map((rule) => (
          <li
            key={rule.id}
            id={ruleRowElementId(rule.id)}
            role="option"
            aria-selected={focusedId === rule.id}
            className={`flex flex-col gap-2 rounded-lg border border-border p-4 ${
              focusedId === rule.id ? 'outline outline-2 outline-ring' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <RuleDecisionChip decision={rule.decision} />
              <RuleTypeCell rule={rule} />
            </div>

            <RulePatternCell pattern={rule.pattern} />

            <div className="flex flex-wrap items-center gap-2 text-ui-sm text-muted-foreground">
              <RuleFolderCell rule={rule} />
              <RuleValidityCell rule={rule} expiringSoon={expiringSoon.has(rule.id)} now={now} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-ui-xs text-muted-foreground">
              <RuleUsageCell rule={rule} />
              <RuleLastUsedCell rule={rule} now={now} />
              <RuleCreatedCell rule={rule} now={now} />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="touch"
                onClick={() => {
                  onOpen(rule.id);
                }}
              >
                {t('rules.action.open')}
              </Button>
              {rule.status !== 'revoked' && rule.status !== 'disabled' && (
                <Button
                  variant="outline"
                  size="touch"
                  disabled={inFlight.has(rule.id)}
                  onClick={() => {
                    onRevoke(rule.id);
                  }}
                >
                  {inFlight.has(rule.id) ? t('rules.action.revoking') : t('rules.action.revoke')}
                </Button>
              )}
            </div>

            {failure?.ruleId === rule.id && (
              <RuleFailureMessage
                messageKey={failure.error.messageKey}
                params={failure.error.params}
              />
            )}
          </li>
        ))}
      </ul>
    </RuleListFrame>
  );
}
