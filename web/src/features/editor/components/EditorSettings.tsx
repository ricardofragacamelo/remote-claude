import { useTranslation } from 'react-i18next';

import { SettingChoice } from '@/features/settings';
import type { Choice } from '@/features/settings';
import { usePreferences } from '../hooks/useEditor';
import { DEFAULT_PREFERENCES, FONT_SIZES, TAB_SIZES, ZOOMS } from '../store/preferences.store';
import { AUTO_SAVE_MODES, EDITOR_FONTS } from '../types/editor';
import type { EditorPreferences } from '../types/editor';

/** The options of the section, as Settings' search finds them — named in full. */
export const EDITOR_SETTING_OPTIONS = [
  { id: 'editorFont', labelKey: 'editor.settings.font' },
  { id: 'editorFontSize', labelKey: 'editor.settings.fontSize' },
  { id: 'editorZoom', labelKey: 'editor.settings.zoom' },
  { id: 'editorTabSize', labelKey: 'editor.settings.tabSize' },
  { id: 'editorInsertSpaces', labelKey: 'editor.settings.insertSpaces' },
  { id: 'editorWordWrap', labelKey: 'editor.settings.wordWrap' },
  { id: 'editorMinimap', labelKey: 'editor.settings.minimap' },
  { id: 'editorAutoSave', labelKey: 'editor.settings.autoSave' },
  { id: 'editorTrimWhitespace', labelKey: 'editor.settings.trimTrailingWhitespace' },
  { id: 'editorFinalNewline', labelKey: 'editor.settings.insertFinalNewline' },
] as const;

type FlagKey =
  'insertSpaces' | 'wordWrap' | 'minimap' | 'trimTrailingWhitespace' | 'insertFinalNewline';

/** A preference that is on or off, as two radio buttons. */
interface FlagOption {
  readonly id: string;
  readonly key: FlagKey;
  readonly legendKey: string;
  readonly descriptionKey: string;
}

const FLAGS: readonly FlagOption[] = [
  {
    id: 'editorInsertSpaces',
    key: 'insertSpaces',
    legendKey: 'editor.settings.insertSpaces',
    descriptionKey: 'editor.settings.insertSpacesDescription',
  },
  {
    id: 'editorWordWrap',
    key: 'wordWrap',
    legendKey: 'editor.settings.wordWrap',
    descriptionKey: 'editor.settings.wordWrapDescription',
  },
  {
    id: 'editorMinimap',
    key: 'minimap',
    legendKey: 'editor.settings.minimap',
    descriptionKey: 'editor.settings.minimapDescription',
  },
  {
    id: 'editorTrimWhitespace',
    key: 'trimTrailingWhitespace',
    legendKey: 'editor.settings.trimTrailingWhitespace',
    descriptionKey: 'editor.settings.trimTrailingWhitespaceDescription',
  },
  {
    id: 'editorFinalNewline',
    key: 'insertFinalNewline',
    legendKey: 'editor.settings.insertFinalNewline',
    descriptionKey: 'editor.settings.insertFinalNewlineDescription',
  },
];

/** Numbers as the choices of an option, each with what it is called. */
function numbers(
  values: readonly number[],
  label: (value: number) => string,
): readonly Choice<string>[] {
  return values.map((value) => ({ value: String(value), label: label(value) }));
}

/**
 * Settings › Editor (B-39): the font and its size, the zoom, the size of a tab and spaces or tabs,
 * word wrap, the minimap, the auto-save — off by default — and the two adjustments a save can make.
 * Each takes effect on every open tab at once, and is kept for this browser only; a browser that keeps
 * nothing has the defaults, and the editor works the same (S-257, S-258).
 */
export function EditorSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const { preferences, set } = usePreferences();
  const d = DEFAULT_PREFERENCES;
  const onOff: readonly Choice<'on' | 'off'>[] = [
    { value: 'on', label: t('editor.settings.on') },
    { value: 'off', label: t('editor.settings.off') },
  ];
  const fonts: Readonly<Record<EditorPreferences['font'], string>> = {
    code: t('editor.settings.fontCode'),
    browser: t('editor.settings.fontBrowser'),
  };
  const autoSaves: Readonly<Record<EditorPreferences['autoSave'], string>> = {
    off: t('editor.settings.autoSaveOff'),
    afterDelay: t('editor.settings.autoSaveAfterDelay'),
    onFocusChange: t('editor.settings.autoSaveOnFocusChange'),
  };
  const px = (value: number) => t('editor.settings.pixels', { value });
  const percent = (value: number) => t('editor.settings.percent', { value });
  const columns = (value: number) => t('editor.settings.columns', { value });

  return (
    <div className="flex flex-col gap-4">
      <SettingChoice
        id="editorFont"
        legend={t('editor.settings.font')}
        description={t('editor.settings.fontDescription')}
        value={preferences.font}
        choices={EDITOR_FONTS.map((value) => ({ value, label: fonts[value] }))}
        defaultLabel={fonts[d.font]}
        isDefault={preferences.font === d.font}
        onChange={(value) => {
          set('font', value);
        }}
        onRestore={() => {
          set('font', d.font);
        }}
      />
      <SettingChoice
        id="editorFontSize"
        legend={t('editor.settings.fontSize')}
        description={t('editor.settings.fontSizeDescription')}
        value={String(preferences.fontSize)}
        choices={numbers(FONT_SIZES, px)}
        defaultLabel={px(d.fontSize)}
        isDefault={preferences.fontSize === d.fontSize}
        onChange={(value) => {
          set('fontSize', Number(value));
        }}
        onRestore={() => {
          set('fontSize', d.fontSize);
        }}
      />
      <SettingChoice
        id="editorZoom"
        legend={t('editor.settings.zoom')}
        description={t('editor.settings.zoomDescription')}
        value={String(preferences.zoom)}
        choices={numbers(ZOOMS, percent)}
        defaultLabel={percent(d.zoom)}
        isDefault={preferences.zoom === d.zoom}
        onChange={(value) => {
          set('zoom', Number(value));
        }}
        onRestore={() => {
          set('zoom', d.zoom);
        }}
      />
      <SettingChoice
        id="editorTabSize"
        legend={t('editor.settings.tabSize')}
        description={t('editor.settings.tabSizeDescription')}
        value={String(preferences.tabSize)}
        choices={numbers(TAB_SIZES, columns)}
        defaultLabel={columns(d.tabSize)}
        isDefault={preferences.tabSize === d.tabSize}
        onChange={(value) => {
          set('tabSize', Number(value));
        }}
        onRestore={() => {
          set('tabSize', d.tabSize);
        }}
      />
      <SettingChoice
        id="editorAutoSave"
        legend={t('editor.settings.autoSave')}
        description={t('editor.settings.autoSaveDescription')}
        value={preferences.autoSave}
        choices={AUTO_SAVE_MODES.map((value) => ({ value, label: autoSaves[value] }))}
        defaultLabel={autoSaves[d.autoSave]}
        isDefault={preferences.autoSave === d.autoSave}
        onChange={(value) => {
          set('autoSave', value);
        }}
        onRestore={() => {
          set('autoSave', d.autoSave);
        }}
      />
      {FLAGS.map((flag) => (
        <SettingChoice
          key={flag.id}
          id={flag.id}
          legend={t(flag.legendKey)}
          description={t(flag.descriptionKey)}
          value={preferences[flag.key] ? 'on' : 'off'}
          choices={onOff}
          defaultLabel={d[flag.key] ? t('editor.settings.on') : t('editor.settings.off')}
          isDefault={preferences[flag.key] === d[flag.key]}
          onChange={(value) => {
            set(flag.key, value === 'on');
          }}
          onRestore={() => {
            set(flag.key, d[flag.key]);
          }}
        />
      ))}
    </div>
  );
}
