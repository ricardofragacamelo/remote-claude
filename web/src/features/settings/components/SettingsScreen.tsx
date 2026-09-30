import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { useSettingsSearch } from '../hooks/useSettingsSearch';
import { useSettingsSections } from '../hooks/useSettingsSections';
import { sectionFor } from '../store/settings-sections';
import type { SettingMatch } from '../types/settings';

export interface SettingsScreenProps {
  /** The section of the address — one the route already knows. */
  readonly section: string;

  /** Goes to another section. The route's to perform: the feature never learns the router exists. */
  onSection(id: string): void;
}

/**
 * The app's Settings: the sections at the left — above, under `md` —, a search over every option,
 * and one section at a time (plan 06, B-31).
 *
 * The sections are a registry: what nobody registered is not here, and a section another plan
 * registers is listed and searched with no change to this screen (S-146).
 */
export function SettingsScreen({ section, onSection }: SettingsScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const sections = useSettingsSections();
  const search = useSettingsSearch(sections);
  const active = sectionFor(sections, section);
  // The option a picked result names, until its section is on screen and it has the focus.
  const pending = useRef<SettingMatch | null>(null);

  useEffect(() => {
    const picked = pending.current;

    if (picked === null || search.searching || picked.section.id !== active?.id) {
      return;
    }

    pending.current = null;
    const option = document.getElementById(`setting-${picked.option.id}`);
    option?.scrollIntoView({ block: 'start' });
    option?.focus();
  }, [active, search.searching]);

  const pick = (match: SettingMatch): void => {
    pending.current = match;
    search.setQuery('');
    onSection(match.section.id);
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <nav aria-label={t('settings.sections.label')} className="flex flex-col gap-3 md:w-56">
        <input
          type="search"
          value={search.query}
          aria-label={t('settings.search.label')}
          placeholder={t('settings.search.placeholder')}
          className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
          onChange={(event) => {
            search.setQuery(event.target.value);
          }}
        />
        <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
          {sections.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={entry === active ? 'page' : undefined}
                className={cn(
                  'flex min-h-touch w-full items-center gap-2 rounded-md px-3 text-ui hover:bg-accent md:min-h-8',
                  entry === active && 'bg-accent text-accent-foreground',
                )}
                onClick={() => {
                  onSection(entry.id);
                }}
              >
                <entry.icon className="size-4" aria-hidden />
                {t(entry.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {search.searching ? (
          <SearchResults query={search.query} matches={search.matches} onPick={pick} />
        ) : (
          active !== undefined && (
            <section aria-labelledby="settings-section-heading" className="flex flex-col gap-4">
              <h2 id="settings-section-heading" className="text-ui font-ui-strong">
                {t(active.labelKey)}
              </h2>
              <active.component />
            </section>
          )
        )}
      </div>
    </div>
  );
}

interface SearchResultsProps {
  readonly query: string;
  readonly matches: readonly SettingMatch[];
  onPick(match: SettingMatch): void;
}

/** What the search found, each result with its section — or, when nothing, what was searched. */
function SearchResults({ query, matches, onPick }: SearchResultsProps): React.JSX.Element {
  const { t } = useTranslation();

  if (matches.length === 0) {
    return (
      <p role="status" className="text-ui text-muted-foreground">
        {t('settings.search.none', { query: query.trim() })}
      </p>
    );
  }

  return (
    <ul aria-label={t('settings.search.results')} className="flex flex-col gap-1">
      {matches.map((match) => (
        <li key={`${match.section.id}.${match.option.id}`}>
          <button
            type="button"
            className="flex min-h-touch w-full flex-col items-start justify-center rounded-md px-3 text-left hover:bg-accent md:min-h-10"
            onClick={() => {
              onPick(match);
            }}
          >
            <span className="text-ui">{t(match.option.labelKey)}</span>
            <span className="text-ui-sm text-muted-foreground">{t(match.section.labelKey)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
