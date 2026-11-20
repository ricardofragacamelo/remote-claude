import type { Choice } from '../components/SettingChoice';

/** The two choices of a plain on/off option — the editor's, the search's, any plan's own. */
export function onOffChoices(t: (key: string) => string): readonly Choice<'on' | 'off'>[] {
  return [
    { value: 'on', label: t('editor.settings.on') },
    { value: 'off', label: t('editor.settings.off') },
  ];
}
