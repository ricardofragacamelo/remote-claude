import { Power, PowerOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FilterSelect } from '@/shared/components/FilterSelect';
import type { SelectionBarAction, SelectionBarKeys } from '@/shared/components/SelectionActionBar';
import { SelectionActionBar } from '@/shared/components/SelectionActionBar';
import { SearchField } from '@/shared/components/SearchField';
import { isOriginEnabled } from '../lib/skill-preferences-edit';
import { SKILL_ORIGIN_KEYS } from '../lib/skill-status-words';
import type {
  SkillOrigin,
  SkillPreferencesValue,
  SkillView,
  ToggleableSkillOrigin,
} from '../types/skill';

const SKILL_ORIGINS: readonly SkillOrigin[] = ['project', 'user', 'system'];
const SKILL_STATES = ['enabled', 'disabled'] as const;

/** The i18n keys of this toolbar's own selection bar — declared once, outside any JSX. */
const SELECTION_KEYS: SelectionBarKeys = {
  ariaLabel: 'engines.claude.skills.selectionLabel',
  count: 'engines.claude.skills.selectionCount',
};

export interface SkillsToolbarProps {
  readonly preferences: SkillPreferencesValue;
  onToggleOrigin(origin: ToggleableSkillOrigin, enabled: boolean): void;
  readonly search: string;
  onSearchChange(search: string): void;
  readonly originFilter: SkillOrigin | 'all';
  onOriginFilterChange(origin: SkillOrigin | 'all'): void;
  readonly stateFilter: 'all' | 'enabled' | 'disabled';
  onStateFilterChange(state: 'all' | 'enabled' | 'disabled'): void;
  readonly selectedSkills: readonly SkillView[];
  onToggleSelected(enabled: boolean): void;
}

/**
 * The two origin switches, search, the origin/state filters, and the bulk actions of the current
 * selection (plan 13, B-39, S-182). The project's own origin has no switch of its own — it is always
 * on (D-20).
 */
export function SkillsToolbar({
  preferences,
  onToggleOrigin,
  search,
  onSearchChange,
  originFilter,
  onOriginFilterChange,
  stateFilter,
  onStateFilterChange,
  selectedSkills,
  onToggleSelected,
}: SkillsToolbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const anyDisabled = selectedSkills.some((skill) => !skill.enabled);
  const anyEnabled = selectedSkills.some((skill) => skill.enabled);
  const bulkActions: readonly SelectionBarAction[] = [
    {
      id: 'skill.turnOnSelected',
      labelKey: 'engines.claude.skills.turnOn',
      icon: Power,
      available: () => anyDisabled,
      run: () => {
        onToggleSelected(true);
      },
    },
    {
      id: 'skill.turnOffSelected',
      labelKey: 'engines.claude.skills.turnOff',
      icon: PowerOff,
      available: () => anyEnabled,
      run: () => {
        onToggleSelected(false);
      },
    },
  ].filter((action) => action.available());

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-ui-sm">
          <input
            type="checkbox"
            checked={isOriginEnabled(preferences, 'user')}
            onChange={(event) => {
              onToggleOrigin('user', event.target.checked);
            }}
          />
          {t('engines.claude.skills.originUserSwitch')}
        </label>
        <label className="flex items-center gap-2 text-ui-sm">
          <input
            type="checkbox"
            checked={isOriginEnabled(preferences, 'system')}
            onChange={(event) => {
              onToggleOrigin('system', event.target.checked);
            }}
          />
          {t('engines.claude.skills.originSystemSwitch')}
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          label={t('engines.claude.skills.filterOriginLabel')}
          value={originFilter}
          onChange={(value) => {
            onOriginFilterChange(value as SkillOrigin | 'all');
          }}
          options={[
            { value: 'all', label: t('engines.claude.skills.filterOriginAll') },
            ...SKILL_ORIGINS.map((origin) => ({
              value: origin,
              label: t(SKILL_ORIGIN_KEYS[origin]),
            })),
          ]}
        />
        <FilterSelect
          label={t('engines.claude.skills.filterStateLabel')}
          value={stateFilter}
          onChange={(value) => {
            onStateFilterChange(value as 'all' | 'enabled' | 'disabled');
          }}
          options={[
            { value: 'all', label: t('engines.claude.skills.filterStateAll') },
            ...SKILL_STATES.map((state) => ({
              value: state,
              label: t(
                state === 'enabled'
                  ? 'engines.claude.skills.filterStateEnabled'
                  : 'engines.claude.skills.filterStateDisabled',
              ),
            })),
          ]}
        />
        <SearchField
          label={t('engines.claude.skills.searchLabel')}
          value={search}
          onChange={onSearchChange}
        />
      </div>

      <SelectionActionBar
        count={selectedSkills.length}
        keys={SELECTION_KEYS}
        actions={bulkActions}
      />
    </div>
  );
}
