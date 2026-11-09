import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SelectColumnHeader } from '@/shared/components/SelectColumnHeader';
import { ruleRowElementId } from '../lib/rule-row-actions';
import type { RuleRowActionHandlers } from '../lib/rule-row-actions';
import type { RuleListViewProps } from '../lib/rule-list-view';
import type { RuleOrder, RuleSort } from '../types/rule';
import { RuleListFrame } from './RuleListStatus';
import { RuleTableRow } from './RuleTableRow';

/** One sortable column: the field it orders by, and its translated header. */
interface SortableColumn {
  readonly field: RuleSort;
  readonly labelKey: string;
}

const SORTABLE_COLUMNS: readonly SortableColumn[] = [
  { field: 'pattern', labelKey: 'rules.table.columnPattern' },
  { field: 'expiresAt', labelKey: 'rules.table.columnValidity' },
  { field: 'useCount', labelKey: 'rules.table.columnUsage' },
  { field: 'lastUsedAt', labelKey: 'rules.table.columnLastUsed' },
  { field: 'grantedAt', labelKey: 'rules.table.columnCreated' },
];

export interface RuleTableProps extends RuleListViewProps {
  readonly sort: RuleSort;
  readonly order: RuleOrder;
  onSort(field: RuleSort): void;
  readonly selected: ReadonlySet<string>;
  onToggleSelected(ruleId: string): void;
  readonly handlers: RuleRowActionHandlers;
}

/**
 * The dense, sortable table of rules (S-159, S-161, S-162): the four states, a column per field the
 * screen's architecture lists, and a click on any of the five sortable headers — the same fields
 * `RuleSort` already names, nothing added here.
 */
export function RuleTable({
  rules,
  now,
  expiringSoon,
  sort,
  order,
  onSort,
  selected,
  onToggleSelected,
  focusedId,
  onKeyDown,
  inFlight,
  failure,
  handlers,
  ...status
}: RuleTableProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <RuleListFrame {...status} rows={8}>
      <div className="overflow-x-auto">
        {/* `role="grid"` goes on the `<table>` itself, never a wrapping `<div>`: a grid's own
            children are rows, and a `<table>` is not one of those (axe `aria-required-children`).
            `tabIndex`/`onKeyDown` make it one Tab stop for the whole table (S-168): the rows
            themselves are never in the tab order, and a focus of its own moves among them
            instead, named by `aria-activedescendant` rather than the browser's own `:focus`. */}
        <table
          className="w-full text-ui-sm"
          role="grid"
          tabIndex={0}
          aria-label={t('rules.table.caption')}
          aria-activedescendant={focusedId === null ? undefined : ruleRowElementId(focusedId)}
          onKeyDown={onKeyDown}
        >
          <caption className="sr-only">{t('rules.table.caption')}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SelectColumnHeader label={t('rules.table.columnSelect')} />
              <th className="p-2">{t('rules.table.columnDecision')}</th>
              <th className="p-2">{t('rules.table.columnType')}</th>
              <SortHeaders
                columns={SORTABLE_COLUMNS.slice(0, 1)}
                sort={sort}
                order={order}
                onSort={onSort}
              />
              <th className="p-2">{t('rules.table.columnFolder')}</th>
              <SortHeaders
                columns={SORTABLE_COLUMNS.slice(1)}
                sort={sort}
                order={order}
                onSort={onSort}
              />
              <th className="p-2">{t('rules.table.columnAlerts')}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <RuleTableRow
                key={rule.id}
                rule={rule}
                expiringSoon={expiringSoon.has(rule.id)}
                now={now}
                selected={selected.has(rule.id)}
                focused={focusedId === rule.id}
                onToggleSelected={onToggleSelected}
                busy={inFlight.has(rule.id)}
                failure={failure?.ruleId === rule.id ? failure.error : null}
                handlers={handlers}
              />
            ))}
          </tbody>
        </table>
      </div>
    </RuleListFrame>
  );
}

/** A run of sortable headers — the table has two, split around "Onde vale" (not itself sortable). */
function SortHeaders({
  columns,
  sort,
  order,
  onSort,
}: {
  readonly columns: readonly SortableColumn[];
  readonly sort: RuleSort;
  readonly order: RuleOrder;
  onSort(field: RuleSort): void;
}): React.JSX.Element {
  return (
    <>
      {columns.map((column) => (
        <SortHeader key={column.field} column={column} sort={sort} order={order} onSort={onSort} />
      ))}
    </>
  );
}

function SortHeader({
  column,
  sort,
  order,
  onSort,
}: {
  readonly column: SortableColumn;
  readonly sort: RuleSort;
  readonly order: RuleOrder;
  onSort(field: RuleSort): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const active = sort === column.field;

  return (
    <th
      className="p-2"
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => {
          onSort(column.field);
        }}
      >
        {t(column.labelKey)}
        {active &&
          (order === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          ))}
      </button>
    </th>
  );
}
