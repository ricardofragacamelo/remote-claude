export interface TitledListProps<T> {
  /** Says what the items are, and names the list for whoever reaches it without seeing it. */
  readonly title: string;
  readonly items: readonly T[];
  keyOf(item: T): string;
  children(item: T): React.ReactNode;
}

/**
 * A small titled list, or nothing at all when it has nothing in it.
 *
 * The groups of the command menu and the groups of files an undo reaches are the same shape — a
 * heading, and a list named after it — and an empty one renders nothing, so a screen reads as what
 * is there rather than as a form with blanks.
 */
export function TitledList<T>({
  title,
  items,
  keyOf,
  children,
}: TitledListProps<T>): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase opacity-70">{title}</h3>
      <ul className="flex flex-col gap-1" aria-label={title}>
        {items.map((item) => (
          <li key={keyOf(item)} className="flex flex-col text-xs">
            {children(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
