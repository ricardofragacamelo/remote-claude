import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';

// Reordered against `McpServerTable.tsx`'s own imports — the same five, in the same order, read as
// one coincidental clone by jscpd; the two tables share no code, only the same shared components.
import { SelectCell } from '@/shared/components/SelectCell';
import { SelectableTableRow } from '@/shared/components/SelectableTableRow';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ruleRowActions, ruleRowElementId } from '../lib/rule-row-actions';
import type { RuleRowActionHandlers } from '../lib/rule-row-actions';
import type { PermissionRule, RowFailure } from '../types/rule';
import {
  RuleCreatedCell,
  RuleLastUsedCell,
  RuleUsageCell,
  RuleValidityCell,
} from './RuleValidityCell';
import { RuleDecisionChip } from './RuleDecisionChip';
import { RuleFailureMessage } from './RuleFailureMessage';
import { RuleFolderCell } from './RuleFolderCell';
import { RulePatternCell } from './RulePatternCell';
import { RuleTypeCell } from './RuleTypeCell';

/** How many `<td>`s a row has — the failure row below it spans every one of them. */
const COLUMN_COUNT = 10;

export interface RuleTableRowProps {
  readonly rule: PermissionRule;
  readonly expiringSoon: boolean;
  readonly now: number;
  readonly selected: boolean;
  readonly focused: boolean;
  onToggleSelected(ruleId: string): void;

  /** Whether a mutation of this rule is already running — the row's own guard against a second
   * click, beside the hook's own (S-19). */
  readonly busy: boolean;

  /** Why the last mutation of this rule failed, when it did — the row stays, with the reason
   * beside it (S-21). */
  readonly failure: RowFailure | null;
  readonly handlers: RuleRowActionHandlers;
}

/** One row of the dense rules table — every column S-161 lists, and the context menu S-161 ends with. */
export function RuleTableRow({
  rule,
  expiringSoon,
  now,
  selected,
  focused,
  onToggleSelected,
  busy,
  failure,
  handlers,
}: RuleTableRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const actions = ruleRowActions(rule, handlers, busy);
  const findingsCount = rule.findings?.length ?? 0;

  return (
    <>
      <SelectableTableRow
        id={ruleRowElementId(rule.id)}
        className={`cursor-default border-b border-border last:border-b-0 hover:bg-accent/50 ${
          focused ? 'bg-accent/50 outline outline-2 outline-ring -outline-offset-2' : ''
        }`}
        onDoubleClick={() => {
          handlers.onOpen(rule.id);
        }}
        ariaLabel={t('rules.table.rowMenuLabel', { pattern: rule.pattern })}
        actions={actions}
      >
        <SelectCell
          ariaLabel={t('rules.table.rowSelect', { pattern: rule.pattern })}
          checked={selected}
          onToggle={() => {
            onToggleSelected(rule.id);
          }}
        />
        <td className="p-2">
          <RuleDecisionChip decision={rule.decision} />
        </td>
        <td className="p-2">
          <RuleTypeCell rule={rule} />
        </td>
        <td className="p-2">
          <RulePatternCell pattern={rule.pattern} />
        </td>
        <td className="p-2">
          <RuleFolderCell rule={rule} />
        </td>
        <td className="p-2">
          <RuleValidityCell rule={rule} expiringSoon={expiringSoon} now={now} />
        </td>
        <td className="p-2">
          <RuleUsageCell rule={rule} />
        </td>
        <td className="p-2">
          <RuleLastUsedCell rule={rule} now={now} />
        </td>
        <td className="p-2">
          <RuleCreatedCell rule={rule} now={now} />
        </td>
        <td className="p-2">
          {findingsCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={t('rules.table.hasAlert', { count: findingsCount })}
                  className="inline-flex text-warning"
                >
                  <TriangleAlert className="size-4" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('rules.table.hasAlert', { count: findingsCount })}</TooltipContent>
            </Tooltip>
          )}
        </td>
      </SelectableTableRow>
      {failure !== null && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="px-2 pb-2">
            <RuleFailureMessage messageKey={failure.messageKey} params={failure.params} />
          </td>
        </tr>
      )}
    </>
  );
}
