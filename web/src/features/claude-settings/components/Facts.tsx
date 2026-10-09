/** One fact of a list: a label and its value, both already translated or data. */
export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

/** A list of facts — the account, the versions — as a description list. */
export function Facts({
  label,
  facts,
}: {
  readonly label: string;
  readonly facts: readonly Fact[];
}): React.JSX.Element {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-1 gap-x-4 gap-y-2 text-ui sm:grid-cols-[auto_1fr]"
    >
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="flex min-w-0 flex-col break-words">
            <span>{fact.value}</span>
            {fact.note !== undefined && (
              <span className="text-ui-sm text-muted-foreground">{fact.note}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
