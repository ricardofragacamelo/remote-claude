import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';

import { SelectCell } from '@/shared/components/SelectCell';
import { SelectableTableRow } from '@/shared/components/SelectableTableRow';
import { DenseTableHead } from '@/shared/components/DenseTableHead';
import { DenseTableFrame } from '@/shared/components/DenseTableFrame';
import { skillRowKeyOf } from '../lib/skill-identity';
import { skillRowActions } from '../lib/skill-row-actions';
import { SKILL_ORIGIN_KEYS, SKILL_UNLOADED_REASON_KEYS } from '../lib/skill-status-words';
import type { SkillView } from '../types/skill';

export interface SkillTableProps {
  readonly skills: readonly SkillView[];
  readonly selected: ReadonlySet<string>;
  onToggleSelected(key: string): void;
  readonly folder: string;
  onToggleSkill(skill: SkillView, enabled: boolean): void;
}

/**
 * The dense table of the skills that apply in a folder (plan 13, B-34, B-39, S-182): name, origin,
 * description, state — and, for the handful a declared hook kept out entirely, why. A project skill's
 * row opens it in the editor (plan 07); the others have none to open (D-20: their files are the
 * user's or the system's own, outside what this folder's allowlist reaches).
 */
export function SkillTable({
  skills,
  selected,
  onToggleSelected,
  folder,
  onToggleSkill,
}: SkillTableProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DenseTableFrame caption={t('engines.claude.skills.tableCaption')}>
      <DenseTableHead
        selectLabel={t('engines.claude.skills.columnSelect')}
        columns={[
          t('engines.claude.skills.columnName'),
          t('engines.claude.skills.columnOrigin'),
          t('engines.claude.skills.columnDescription'),
          t('engines.claude.skills.columnState'),
        ]}
      />
      <tbody>
        {skills.map((skill) => {
          const key = skillRowKeyOf(skill);
          const actions = skillRowActions(skill, folder, {
            onToggleSkill,
            openInEditor: (href) => {
              void navigate({ href });
            },
          });

          const openInEditor = actions.find((action) => action.id === 'skill.openInEditor');

          return (
            <SelectableTableRow
              key={key}
              ariaLabel={t('engines.claude.skills.rowMenuLabel', { name: skill.name })}
              actions={actions}
              {...(openInEditor === undefined ? {} : { onDoubleClick: openInEditor.run })}
            >
              <SelectCell
                ariaLabel={t('engines.claude.skills.rowSelect', { name: skill.name })}
                checked={selected.has(key)}
                onToggle={() => {
                  onToggleSelected(key);
                }}
              />
              <td className="p-2 font-ui-strong">{skill.name}</td>
              <td className="p-2">{t(SKILL_ORIGIN_KEYS[skill.origin])}</td>
              <td className="p-2">{skill.description}</td>
              <td className="p-2">
                {skill.enabled
                  ? t('engines.claude.skills.stateEnabled')
                  : t('engines.claude.skills.stateDisabled')}
                {skill.unloadedReason !== null && (
                  <p className="text-ui-xs text-muted-foreground">
                    {t(SKILL_UNLOADED_REASON_KEYS[skill.unloadedReason])}
                  </p>
                )}
              </td>
            </SelectableTableRow>
          );
        })}
      </tbody>
    </DenseTableFrame>
  );
}
