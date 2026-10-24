export interface SelectColumnHeaderProps {
  /** Already translated — read only by assistive technology, the column has no visible label. */
  readonly label: string;
}

/**
 * The header cell of a dense table's leading checkbox column — `mcp`'s own `McpServerTable` and an
 * engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29, B-34) all start their
 * header row the same way.
 */
export function SelectColumnHeader({ label }: SelectColumnHeaderProps): React.JSX.Element {
  return (
    <th className="w-8 p-2">
      <span className="sr-only">{label}</span>
    </th>
  );
}
