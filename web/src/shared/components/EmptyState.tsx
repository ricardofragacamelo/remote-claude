export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
}

/**
 * The empty state of a screen.
 *
 * It says what to do next, not "no data" — an empty list with no explanation reads as a bug.
 */
export function EmptyState({ title, description }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border p-6">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
