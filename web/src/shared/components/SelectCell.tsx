export interface SelectCellProps {
  /** Already translated. */
  readonly ariaLabel: string;
  readonly checked: boolean;

  /** Shift held — a row's own selection grows into a shift-click range on top of it (B-24, S-177). */
  onToggle(shiftKey: boolean): void;
}

/**
 * The checkbox cell every dense, selectable table row starts with — `mcp`'s own `McpServerTable` and
 * an engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29, B-34) all have the same
 * one.
 *
 * `onClick`, not `onChange`: a native click is the one DOM event that reliably carries `shiftKey`
 * across browsers for a checkbox — `readOnly` tells React this is deliberate, not a forgotten
 * `onChange`.
 */
export function SelectCell({ ariaLabel, checked, onToggle }: SelectCellProps): React.JSX.Element {
  return (
    <td className="p-2">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        readOnly
        onClick={(event) => {
          onToggle(event.shiftKey);
        }}
      />
    </td>
  );
}
