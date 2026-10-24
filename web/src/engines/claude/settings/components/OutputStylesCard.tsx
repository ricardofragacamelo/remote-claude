import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/shared/components/ui/button';
import type { AppError } from '@/shared/api/errors';
import { claudeEngineKeys } from '../../hooks/claude-engine-keys';
import { saveOutputStyle } from '../../services/claude-engine.service';
import type { OutputStyleView } from '../../types/output-style';
import { outputStyleTemplate } from '../lib/artifact-templates';
import { projectConfigKeys } from '../hooks/project-config-keys';
import type { ProjectOutputStyleEntry } from '../types/project-config';
import { ArtifactListCard } from './ArtifactListCard';
import { ArtifactNameCell } from './ArtifactNameCell';

export interface OutputStylesCardProps {
  readonly folder: string;
  readonly outputStyles: readonly ProjectOutputStyleEntry[];
}

/**
 * The project's own output styles (plan 13, B-37): name, whether it is the one applying here right
 * now, and a way to set one as the default of this folder — the same whole-folder override every
 * other default of this screen already has (D-04, D-06), through the output style's own existing
 * `PUT` (`saveOutputStyle`), never a route of its own.
 */
export function OutputStylesCard({
  folder,
  outputStyles,
}: OutputStylesCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setDefault = useMutation<OutputStyleView, AppError, string>({
    mutationFn: (name) => saveOutputStyle(folder, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: claudeEngineKeys.outputStyle(folder) });
      void queryClient.invalidateQueries({ queryKey: projectConfigKeys.of(folder) });
    },
  });

  return (
    <ArtifactListCard
      headingId="project-output-styles-heading"
      folder={folder}
      items={outputStyles}
      nameOf={(style) => style.name}
      pathFor={(name) => `.claude/output-styles/${name}.md`}
      contentFor={outputStyleTemplate}
      invalidateKey={projectConfigKeys.of(folder)}
      strings={{
        title: t('engines.claude.project.outputStylesTitle'),
        newLabel: t('engines.claude.project.newOutputStyle'),
        emptyTitle: t('engines.claude.project.outputStylesEmptyTitle'),
        emptyBody: t('engines.claude.project.outputStylesEmptyBody'),
        searchLabel: t('engines.claude.project.outputStylesSearchLabel'),
        tableCaption: t('engines.claude.project.outputStylesTableCaption'),
        columns: [
          t('engines.claude.project.outputStylesColumnName'),
          t('engines.claude.project.outputStylesColumnState'),
          t('engines.claude.project.outputStylesColumnActions'),
        ],
        newTitle: t('engines.claude.project.newOutputStyleTitle'),
        newDescription: t('engines.claude.project.newOutputStyleDescription'),
        newNameLabel: t('engines.claude.project.newOutputStyleNameLabel'),
      }}
      renderRow={(style) => (
        <tr key={style.name} className="border-b border-border last:border-b-0">
          <td className="p-2 font-code">
            <ArtifactNameCell folder={folder} sourceFile={style.sourceFile} label={style.name} />
          </td>
          <td className="p-2">
            {style.current && t('engines.claude.project.outputStylesCurrent')}
          </td>
          <td className="p-2">
            {!style.current && (
              <Button
                variant="outline"
                disabled={setDefault.isPending}
                onClick={() => {
                  setDefault.mutate(style.name);
                }}
              >
                {t('engines.claude.project.outputStylesSetDefault')}
              </Button>
            )}
          </td>
        </tr>
      )}
    />
  );
}
