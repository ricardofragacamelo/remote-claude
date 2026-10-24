import { SelectColumnHeader } from '@/shared/components/SelectColumnHeader';

export interface DenseTableHeadProps {
  /** Already translated — the leading checkbox column's accessible name. */
  readonly selectLabel: string;

  /** Already translated, in order — everything after the checkbox column. */
  readonly columns: readonly string[];
}

/**
 * The header row of a dense, selectable table: the checkbox column, then every other one, already
 * translated — `mcp`'s own `McpServerTable` and an engine extension's own `PluginTable`/`SkillTable`
 * (plan 13, B-28, B-29, B-34) all build the same row, only the columns themselves differ.
 */
export function DenseTableHead({ selectLabel, columns }: DenseTableHeadProps): React.JSX.Element {
  return (
    <thead>
      <tr className="border-b border-border text-left text-muted-foreground">
        <SelectColumnHeader label={selectLabel} />
        {columns.map((column) => (
          <th key={column} className="p-2">
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}
