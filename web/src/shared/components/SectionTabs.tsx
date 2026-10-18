import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

/** What a section needs to be one of these tabs: an id to key by, an icon to show beside its label. */
export interface SectionTabEntry {
  readonly id: string;
  readonly icon: LucideIcon;
}

export interface SectionTabsProps<T extends SectionTabEntry> {
  readonly entries: readonly T[];
  readonly active: T | undefined;
  /** The label of one entry — a section's title, with whatever it interpolates. */
  label(entry: T): string;
  onSelect(entry: T): void;
}

/**
 * A screen's sections, as a row of tabs above `md` and a column beside the active one from there —
 * shared by every screen a registry of sections picks one of at a time ([Settings](../../features/settings/components/SettingsScreen.tsx),
 * [the agent's own](../../features/agent-settings/components/AgentSettingsScreen.tsx)).
 */
export function SectionTabs<T extends SectionTabEntry>({
  entries,
  active,
  label,
  onSelect,
}: SectionTabsProps<T>): React.JSX.Element {
  return (
    <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            aria-current={entry === active ? 'page' : undefined}
            className={cn(
              'flex min-h-touch w-full items-center gap-2 rounded-md px-3 text-ui hover:bg-accent md:min-h-8',
              entry === active && 'bg-accent text-accent-foreground',
            )}
            onClick={() => {
              onSelect(entry);
            }}
          >
            <entry.icon className="size-4" aria-hidden />
            {label(entry)}
          </button>
        </li>
      ))}
    </ul>
  );
}
