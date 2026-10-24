export interface SelectCellProps {
  /** Already translated. */
  readonly ariaLabel: string;
  readonly checked: boolean;
  onToggle(): void;
}

/**
 * The checkbox cell every dense, selectable table row starts with — `mcp`'s own `McpServerTable` and
 * an engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29, B-34) all have the same
 * one.
 */
export function SelectCell({ ariaLabel, checked, onToggle }: SelectCellProps): React.JSX.Element {
  return (
    <td className="p-2">
      <input type="checkbox" aria-label={ariaLabel} checked={checked} onChange={onToggle} />
    </td>
  );
}
