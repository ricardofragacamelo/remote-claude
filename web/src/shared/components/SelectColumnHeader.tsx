import { useEffect, useRef } from 'react';

export interface SelectColumnHeaderProps {
  /** Already translated — read only by assistive technology when there is no `onSelectAll` to
   * offer, since the column then has no visible label. */
  readonly label: string;

  /** Whether every row the list currently shows is selected — absent along with `onSelectAll`. */
  readonly allSelected?: boolean;

  /** Whether some, but not all, are — shown as the checkbox's `indeterminate` state. */
  readonly someSelected?: boolean;

  /** Selects every row currently shown, or clears the selection when all of them already are
   * (B-24, S-177). Omitted: the header stays a plain, non-interactive label, the way `mcp`'s own
   * `McpServerTable` and an engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29,
   * B-34) have always had it. */
  onSelectAll?(): void;
}

/**
 * The header cell of a dense table's leading checkbox column — `mcp`'s own `McpServerTable` and an
 * engine extension's own `PluginTable`/`SkillTable` (plan 13, B-28, B-29, B-34) all start their
 * header row the same way, none of them with a "select all" of their own yet.
 */
export function SelectColumnHeader({
  label,
  allSelected,
  someSelected,
  onSelectAll,
}: SelectColumnHeaderProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  // A DOM property no JSX attribute reaches — set whenever the checkbox is actually rendered
  // (`onSelectAll` given); without one, the early return below never mounts an `<input>` to hold it.
  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = someSelected === true && allSelected !== true;
    }
  });

  if (onSelectAll === undefined) {
    return (
      <th className="w-8 p-2">
        <span className="sr-only">{label}</span>
      </th>
    );
  }

  return (
    <th className="w-8 p-2">
      <input
        ref={inputRef}
        type="checkbox"
        aria-label={label}
        checked={allSelected ?? false}
        onChange={onSelectAll}
      />
    </th>
  );
}
