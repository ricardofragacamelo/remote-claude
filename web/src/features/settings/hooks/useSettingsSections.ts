import { useRegistry } from '@/shared/hooks/useRegistry';
import { settingsSections } from '../store/settings-sections';
import type { SettingsSectionEntry } from '../types/settings';

/** The sections registered now, in order — and a render whenever one comes or goes. */
export function useSettingsSections(): readonly SettingsSectionEntry[] {
  return useRegistry(settingsSections);
}
