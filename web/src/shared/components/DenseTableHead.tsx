import { SelectColumnHeader } from '@/shared/components/SelectColumnHeader';

export interface DenseTableHeadProps {
  /** Already translated — the leading checkbox column's accessible name. Omitted for a table with no
   * selection at all (an engine extension's own read-only Project cards, plan 13, B-32…B-38). */
  readonly selectLabel?: string;

  /** Already translated, in order — everything after the checkbox column, when there is one. */
  readonly columns: readonly string[];
}

/**
 * The header row of a dense table, already translated: the checkbox column when `selectLabel` is
 * given, then every other one — `mcp`'s own `McpServerTable` and an engine extension's own
 * `PluginTable`/`SkillTable`/Project cards (plan 13, B-28, B-29, B-34, B-39) all build the same row,
 * only the columns themselves (and whether there is a selection at all) differ.
 */
export function DenseTableHead({ selectLabel, columns }: DenseTableHeadProps): React.JSX.Element {
  return (
    <thead>
      <tr className="border-b border-border text-left text-muted-foreground">
        {selectLabel !== undefined && <SelectColumnHeader label={selectLabel} />}
        {columns.map((column) => (
          <th key={column} className="p-2">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}
