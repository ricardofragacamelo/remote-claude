import { cn } from '@/shared/lib/utils';

export interface RuleWizardOptionProps {
  readonly pressed: boolean;
  onClick(): void;
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * One choice of a single-select group, pressed or not — the one button shape every step of the
 * rule-authoring wizard picks from (kind, the pattern's own form, where it reaches, Allow/Block —
 * plan 15, B-27). `role="radio"` on each, inside the group's own `role="radiogroup"`; the caller
 * gives the layout its own `className` — a dense grid pill, or a wider card with an icon.
 */
export function RuleWizardOption({
  pressed,
  onClick,
  className,
  children,
}: RuleWizardOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={pressed}
      className={cn(
        className,
        pressed ? 'border-primary bg-accent font-ui-strong' : 'border-border hover:bg-muted',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
