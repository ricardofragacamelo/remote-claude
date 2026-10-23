export interface SearchFieldProps {
  /** Already translated. */
  readonly label: string;
  readonly value: string;
  onChange(value: string): void;
}

/**
 * The search field every list-shaped screen starts its toolbar with — a label and a text input,
 * narrowing the list as it is typed. Shared by `mcp`'s own `McpToolbar` and an engine extension's own
 * `PluginToolbar` (plan 13, B-28, B-29), rather than each hand-copying the same label-and-input pair.
 */
export function SearchField({ label, value, onChange }: SearchFieldProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-ui-sm">
      {label}
      <input
        className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}
