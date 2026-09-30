import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SettingMatch, SettingsSectionEntry } from '../types/settings';

/** The search of Settings: what was typed, and the options it found. */
export interface SettingsSearch {
  readonly query: string;
  setQuery(value: string): void;

  /** Somebody is searching — the sections give way to the results. */
  readonly searching: boolean;
  readonly matches: readonly SettingMatch[];
}

/**
 * Searches the options every section declares, by their label **in the language on screen** — what
 * a person reads is what a person types (plan 06, S-203). A section another plan registers is
 * searched the moment it registers, with no change here.
 */
export function useSettingsSearch(sections: readonly SettingsSectionEntry[]): SettingsSearch {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();

  const matches =
    needle === ''
      ? []
      : sections.flatMap((section) =>
          section.options
            .filter((option) => t(option.labelKey).toLocaleLowerCase().includes(needle))
            .map((option) => ({ section, option })),
        );

  return { query, setQuery, searching: needle !== '', matches };
}
