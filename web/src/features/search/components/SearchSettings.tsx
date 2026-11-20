import { useTranslation } from 'react-i18next';

import { onOffChoices, SettingChoice, SettingRestoreFooter } from '@/features/settings';
import type { Choice } from '@/features/settings';
import {
  DEFAULT_SEARCH_PREFERENCES,
  RESULTS_EDITOR_CONTEXT_LINES,
  useSearchPreferences,
} from '../store/search-preferences.store';

/** The options of the section, as Settings' search finds them — named in full. */
export const SEARCH_SETTING_OPTIONS = [
  { id: 'searchExclude', labelKey: 'search.settings.exclude' },
  { id: 'searchUseIgnoreFiles', labelKey: 'search.settings.useIgnoreFiles' },
  { id: 'searchSmartCase', labelKey: 'search.settings.smartCase' },
  { id: 'searchResultsEditorContextLines', labelKey: 'search.settings.resultsEditorContextLines' },
] as const;

/**
 * "Exclusões" (D-03): a free-text list of globs, not a choice among a few values — its own small
 * row, the same default/restore convention as {@link SettingChoice} beside a text field instead of
 * radio buttons.
 */
function ExcludeField({
  value,
  defaultValue,
  onChange,
  onRestore,
}: {
  readonly value: string;
  readonly defaultValue: string;
  onChange(value: string): void;
  onRestore(): void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const isDefault = value === defaultValue;
  const legend = t('search.settings.exclude');
  // The only default this screen ever hands it is `''` (D-03) — named, never shown as a blank
  // label.
  const defaultLabel = t('search.settings.excludeDefaultEmpty');

  return (
    <fieldset
      id="setting-searchExclude"
      tabIndex={-1}
      aria-describedby="setting-searchExclude-description"
      className="flex flex-col gap-2 rounded-lg border border-border p-4"
    >
      <legend className="px-1 text-ui font-ui-strong">{legend}</legend>
      <p id="setting-searchExclude-description" className="text-ui text-muted-foreground">
        {t('search.settings.excludeDescription')}
      </p>

      <input
        type="text"
        value={value}
        aria-label={legend}
        placeholder={t('search.view.excludePlaceholder')}
        className="h-7 min-h-touch w-full rounded-md border border-border bg-background px-2 text-ui md:min-h-0"
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />

      <SettingRestoreFooter
        legend={legend}
        defaultLabel={defaultLabel}
        isDefault={isDefault}
        onRestore={onRestore}
      />
    </fieldset>
  );
}

/**
 * Settings › Busca (plan 11, B-19): the globs excluded from every search and Quick Open on top of
 * the 07's own (D-03), whether ignore files apply by default, "caixa inteligente" (case-sensitive
 * the moment the query has an upper-case letter), and the context lines a freshly opened results
 * editor starts with. Each is a convenience of this browser (D-13 of 06): a folder tab already
 * open keeps what it has, and the next search, or the next "open in editor", reads the new value.
 */
export function SearchSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { preferences, set } = useSearchPreferences();
  const d = DEFAULT_SEARCH_PREFERENCES;
  const onOff = onOffChoices(t);
  const contextLinesChoices: readonly Choice<string>[] = RESULTS_EDITOR_CONTEXT_LINES.map(
    (value) => ({ value: String(value), label: String(value) }),
  );

  return (
    <div className="flex flex-col gap-4">
      <ExcludeField
        value={preferences.exclude}
        defaultValue={d.exclude}
        onChange={(value) => {
          set('exclude', value);
        }}
        onRestore={() => {
          set('exclude', d.exclude);
        }}
      />
      <SettingChoice
        id="searchUseIgnoreFiles"
        legend={t('search.settings.useIgnoreFiles')}
        description={t('search.settings.useIgnoreFilesDescription')}
        value={preferences.useIgnoreFiles ? 'on' : 'off'}
        choices={onOff}
        defaultLabel={t('editor.settings.on')}
        isDefault={preferences.useIgnoreFiles === d.useIgnoreFiles}
        onChange={(value) => {
          set('useIgnoreFiles', value === 'on');
        }}
        onRestore={() => {
          set('useIgnoreFiles', d.useIgnoreFiles);
        }}
      />
      <SettingChoice
        id="searchSmartCase"
        legend={t('search.settings.smartCase')}
        description={t('search.settings.smartCaseDescription')}
        value={preferences.smartCase ? 'on' : 'off'}
        choices={onOff}
        defaultLabel={t('editor.settings.off')}
        isDefault={preferences.smartCase === d.smartCase}
        onChange={(value) => {
          set('smartCase', value === 'on');
        }}
        onRestore={() => {
          set('smartCase', d.smartCase);
        }}
      />
      <SettingChoice
        id="searchResultsEditorContextLines"
        legend={t('search.settings.resultsEditorContextLines')}
        description={t('search.settings.resultsEditorContextLinesDescription')}
        value={String(preferences.resultsEditorContextLines)}
        choices={contextLinesChoices}
        defaultLabel={String(d.resultsEditorContextLines)}
        isDefault={preferences.resultsEditorContextLines === d.resultsEditorContextLines}
        onChange={(value) => {
          set('resultsEditorContextLines', Number(value) as typeof d.resultsEditorContextLines);
        }}
        onRestore={() => {
          set('resultsEditorContextLines', d.resultsEditorContextLines);
        }}
      />
    </div>
  );
}
