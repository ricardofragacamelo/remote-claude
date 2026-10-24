import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FolderPicker } from '@/features/agent-settings';
import type { SectionBodyProps } from '@/features/agent-settings';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { EmptyState } from '@/shared/components/EmptyState';
import { useSelection } from '@/shared/hooks/useSelection';
import { useSkillMutations } from '../hooks/useSkillMutations';
import { useSkillPreferences } from '../hooks/useSkillPreferences';
import { useSkills } from '../hooks/useSkills';
import { useSkillToggleFlow } from '../hooks/useSkillToggleFlow';
import { qualifiedSkillNameOf, skillRowKeyOf } from '../lib/skill-identity';
import type { SkillOrigin, SkillView } from '../types/skill';
import { EnableOriginDialog } from './EnableOriginDialog';
import { SkillsToolbar } from './SkillsToolbar';
import { SkillTable } from './SkillTable';

type OriginFilter = SkillOrigin | 'all';
type StateFilter = 'all' | 'enabled' | 'disabled';

function visibleSkills(
  skills: readonly SkillView[],
  search: string,
  origin: OriginFilter,
  state: StateFilter,
): readonly SkillView[] {
  const query = search.trim().toLowerCase();
  return skills
    .filter((skill) => query === '' || skill.name.toLowerCase().includes(query))
    .filter((skill) => origin === 'all' || skill.origin === origin)
    .filter((skill) => state === 'all' || (state === 'enabled') === skill.enabled)
    .sort((a, b) => a.name.localeCompare(b.name) || a.origin.localeCompare(b.origin));
}

/**
 * "Skills": every skill that applies in a folder — the project's own, the user's, the system's —
 * with its origin, its state, and the preferences that turn an origin or one skill on or off (plan
 * 13, B-34, B-39, S-182).
 *
 * Reading the list needs a folder (what a skill even is depends on where you are); a preference,
 * once chosen, always applies at that same folder's own level — D-04's overlay still resolves it
 * against the user's and an ancestor's, the same as every other default.
 */
export function SkillsSection({
  engine,
  location,
  onLocation,
}: SectionBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const folder = location.folder;
  const data = useSkills(folder);
  const preferences = useSkillPreferences(folder);
  const mutations = useSkillMutations(folder);
  const toggleFlow = useSkillToggleFlow(preferences.value, data.skills, mutations);

  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const selection = useSelection();

  const shown = useMemo(
    () => visibleSkills(data.skills, search, originFilter, stateFilter),
    [data.skills, search, originFilter, stateFilter],
  );
  const selectedSkills = shown.filter((skill) => selection.ids.has(skillRowKeyOf(skill)));

  if (folder === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <FolderPicker engine={engine} location={location} onLocation={onLocation} />
        <EmptyState
          title={t('engines.claude.skills.chooseFolderTitle')}
          description={t('engines.claude.skills.chooseFolderBody')}
        />
      </div>
    );
  }

  const ready =
    !data.isLoading && data.error === null && !preferences.isLoading && preferences.error === null;

  return (
    <div className="flex flex-col gap-4">
      <FolderPicker engine={engine} location={location} onLocation={onLocation} />

      <LoadStatus
        rows={4}
        isLoading={data.isLoading || preferences.isLoading}
        loadingLabel={t('engines.claude.skills.loading')}
        error={data.error ?? preferences.error}
        onRetry={() => {
          data.retry();
          preferences.retry();
        }}
      />

      {ready && (
        <>
          {toggleFlow.error !== null && (
            <p role="alert" className="text-ui-sm text-destructive">
              {t('engines.claude.skills.saveError')}
            </p>
          )}

          <SkillsToolbar
            preferences={preferences.value}
            onToggleOrigin={toggleFlow.toggleOrigin}
            search={search}
            onSearchChange={setSearch}
            originFilter={originFilter}
            onOriginFilterChange={setOriginFilter}
            stateFilter={stateFilter}
            onStateFilterChange={setStateFilter}
            selectedSkills={selectedSkills}
            onToggleSelected={(enabled) => {
              toggleFlow.toggleSkills(selectedSkills.map(qualifiedSkillNameOf), enabled);
            }}
          />

          {data.skills.length === 0 ? (
            <EmptyState
              title={t('engines.claude.skills.emptyTitle')}
              description={t('engines.claude.skills.emptyBody')}
            />
          ) : (
            <SkillTable
              skills={shown}
              selected={selection.ids}
              onToggleSelected={selection.toggle}
              folder={folder}
              onToggleSkill={(skill, enabled) => {
                toggleFlow.toggleSkills([qualifiedSkillNameOf(skill)], enabled);
              }}
            />
          )}
        </>
      )}

      <EnableOriginDialog flow={toggleFlow} />
    </div>
  );
}
