import type { LucideIcon } from 'lucide-react';

export interface ViewPlaceholderProps {
  readonly icon: LucideIcon;

  /** What the place is — translated. */
  readonly title: string;

  /** What will live here, and when — translated. */
  readonly description: string;
}

/**
 * A place of the workbench whose owner has not arrived yet.
 *
 * It says what will live here, never a blank with no reason: an empty area reads as something that
 * failed to load (docs/architecture/web/03-ui-system.md#anatomia-do-workbench).
 */
export function ViewPlaceholder({
  icon: Icon,
  title,
  description,
}: ViewPlaceholderProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-ui font-ui-strong">{title}</p>
      <p className="max-w-xs text-ui-sm text-muted-foreground">{description}</p>
    </div>
  );
}
