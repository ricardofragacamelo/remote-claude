import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import type { SectionBodyProps } from '@/features/agent-settings';
import { EmptyState } from '@/shared/components/EmptyState';
import { useSelection } from '@/shared/hooks/useSelection';
import { skillTemplate } from '../lib/artifact-templates';
import { useCreateArtifactFlow } from '../hooks/useCreateArtifactFlow';
import { skillKeys } from '../hooks/skill-keys';
import { useSkillMutations } from '../hooks/useSkillMutations';
import { useSkillPreferences } from '../hooks/useSkillPreferences';
import { useSkills } from '../hooks/useSkills';
import { useSkillToggleFlow } from '../hooks/useSkillToggleFlow';
import { qualifiedSkillNameOf, skillRowKeyOf } from '../lib/skill-identity';
import type { SkillOrigin, SkillView } from '../types/skill';
import type { CreateArtifactFlow } from '../hooks/useCreateArtifactFlow';
import type { SkillToggleFlow } from '../hooks/useSkillToggleFlow';
import type { SkillPreferencesValue } from '../types/skill';
import { EnableOriginDialog } from './EnableOriginDialog';
import { FolderGatedSection } from './FolderGatedSection';
import { NewArtifactDialog } from './NewArtifactDialog';
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

interface SkillsReadyBodyProps {
  readonly folder: string;
  readonly preferences: SkillPreferencesValue;
  readonly toggleFlow: SkillToggleFlow;
  readonly shown: readonly SkillView[];
  readonly skillCount: number;
  readonly search: string;
  onSearchChange(search: string): void;
  readonly originFilter: OriginFilter;
  onOriginFilterChange(origin: OriginFilter): void;
  readonly stateFilter: StateFilter;
  onStateFilterChange(state: StateFilter): void;
  readonly selection: ReturnType<typeof useSelection>;
  readonly createSkillFlow: CreateArtifactFlow;
}

/** The toolbar and the list, once the folder's skills and preferences are both ready — split out of
 * {@link SkillsSection} to keep that one component's own complexity under the project's gate. */
function SkillsReadyBody({
  folder,
  preferences,
  toggleFlow,
  shown,
  skillCount,
  search,
  onSearchChange,
  originFilter,
  onOriginFilterChange,
  stateFilter,
  onStateFilterChange,
  selection,
  createSkillFlow,
}: SkillsReadyBodyProps): React.JSX.Element {
  const { t } = useTranslation();
  const selectedSkills = shown.filter((skill) => selection.ids.has(skillRowKeyOf(skill)));

  return (
    <>
      {toggleFlow.error !== null && (
        <p role="alert" className="text-ui-sm text-destructive">
          {t('engines.claude.skills.saveError')}
        </p>
      )}

      <SkillsToolbar
        preferences={preferences}
        onToggleOrigin={toggleFlow.toggleOrigin}
        search={search}
        onSearchChange={onSearchChange}
        originFilter={originFilter}
        onOriginFilterChange={onOriginFilterChange}
        stateFilter={stateFilter}
        onStateFilterChange={onStateFilterChange}
        selectedSkills={selectedSkills}
        onToggleSelected={(enabled) => {
          toggleFlow.toggleSkills(selectedSkills.map(qualifiedSkillNameOf), enabled);
        }}
        onNewSkill={createSkillFlow.openDialog}
      />

      {skillCount === 0 ? (
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
  );
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
  const queryClient = useQueryClient();
  const createSkillFlow = useCreateArtifactFlow({
    folder: folder ?? '',
    pathFor: (name) => `.claude/skills/${name}/SKILL.md`,
    contentFor: skillTemplate,
    onCreated: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.list(folder ?? '') });
    },
  });

  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const selection = useSelection();

  const shown = useMemo(
    () => visibleSkills(data.skills, search, originFilter, stateFilter),
    [data.skills, search, originFilter, stateFilter],
  );
  const ready =
    !data.isLoading && data.error === null && !preferences.isLoading && preferences.error === null;

  return (
    <div className="flex flex-col gap-4">
      <FolderGatedSection
        engine={engine}
        location={location}
        onLocation={onLocation}
        folder={folder}
        chooseFolderTitle={t('engines.claude.skills.chooseFolderTitle')}
        chooseFolderBody={t('engines.claude.skills.chooseFolderBody')}
        isLoading={data.isLoading || preferences.isLoading}
        loadingLabel={t('engines.claude.skills.loading')}
        error={data.error ?? preferences.error}
        onRetry={() => {
          data.retry();
          preferences.retry();
        }}
        ready={ready}
      >
        {folder !== undefined && (
          <SkillsReadyBody
            folder={folder}
            preferences={preferences.value}
            toggleFlow={toggleFlow}
            shown={shown}
            skillCount={data.skills.length}
            search={search}
            onSearchChange={setSearch}
            originFilter={originFilter}
            onOriginFilterChange={setOriginFilter}
            stateFilter={stateFilter}
            onStateFilterChange={setStateFilter}
            selection={selection}
            createSkillFlow={createSkillFlow}
          />
        )}
      </FolderGatedSection>

      <EnableOriginDialog flow={toggleFlow} />
      <NewArtifactDialog
        flow={createSkillFlow}
        title={t('engines.claude.skills.newSkillTitle')}
        description={t('engines.claude.skills.newSkillDescription')}
        nameLabel={t('engines.claude.skills.newSkillNameLabel')}
      />
    </div>
  );
}
