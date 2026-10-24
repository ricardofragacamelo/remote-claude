export interface FilterSelectOption {
  readonly value: string;

  /** Already translated. */
  readonly label: string;
}

export interface FilterSelectProps {
  /** Already translated. */
  readonly label: string;
  readonly value: string;
  readonly options: readonly FilterSelectOption[];
  onChange(value: string): void;
}

/**
 * The labeled filter dropdown every list-shaped screen's toolbar narrows by — status, sort, origin,
 * state. Shared by `mcp`'s own `McpToolbar` and an engine extension's own `SkillsToolbar` (plan 13,
 * B-28, B-34), rather than each hand-copying the same label-and-select pair `SearchField` already set
 * the precedent for.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: FilterSelectProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-ui-sm">
      {label}
      <select
        className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
