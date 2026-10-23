export interface FolderSelectProps {
  /** Translated. */
  readonly label: string;

  /** Translated — what the empty option says ("none"). */
  readonly noneLabel: string;
  readonly value: string | undefined;
  readonly choices: readonly string[];

  /** `undefined` for the empty option; the chosen path otherwise. */
  onChange(folder: string | undefined): void;
}

/**
 * Which folder a screen is about, picked from a list of candidates — the open tabs and the recent
 * folders of the workbench, typically (plan 13, B-16, S-182): the control `agentSettings`'s own
 * `FolderPicker` and `mcp`'s own `McpFolderPicker` both draw, each with its own label and its own
 * way of carrying the choice (the address, in both cases, but never this component's business).
 */
export function FolderSelect({
  label,
  noneLabel,
  value,
  choices,
  onChange,
}: FolderSelectProps): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-ui-sm md:max-w-md">
      {label}
      <select
        className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
        value={value ?? ''}
        onChange={(event) => {
          const folder = event.target.value;
          onChange(folder === '' ? undefined : folder);
        }}
      >
        <option value="">{noneLabel}</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    </label>
  );
}
