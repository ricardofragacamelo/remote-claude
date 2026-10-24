import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useCreateFixedFileFlow } from '../hooks/useCreateFixedFileFlow';
import { memoryTemplate } from '../lib/memory-template';
import {
  MEMORY_ORIGIN_KEYS,
  MEMORY_STATE_KEYS,
  memoryFileWithinFolder,
} from '../lib/project-status-words';
import type { MemoryFileView } from '../types/project-config';
import { ArtifactCardShell } from './ArtifactCardShell';
import { ArtifactNameCell } from './ArtifactNameCell';

export interface MemoryCardProps {
  readonly folder: string;
  readonly files: readonly MemoryFileView[];
  onCreated(): void;
}

/** Beside the row of a file where a live session's own report disagrees with the rule alone. */
const DIVERGES_MARK = ' ⚠';

function loadedWordOf(file: MemoryFileView): 'loaded' | 'notLoaded' {
  const loaded = file.loadedConfirmed ?? file.loadedByRule;
  return loaded ? 'loaded' : 'notLoaded';
}

/**
 * Every `CLAUDE.md` this project could bring in — the project's own, `.claude/CLAUDE.md`,
 * `CLAUDE.local.md`, every ancestor's up to the allowlist's root, and the user's own — never the
 * content itself, only whether it exists and whether it is actually loaded here (plan 13, B-32).
 * `loadedConfirmed` (a live session's own word) wins over `loadedByRule` (what the rule alone says);
 * a mismatch between the two is `diverges`, shown as a warning rather than silently picking one.
 */
export function MemoryCard({ folder, files, onCreated }: MemoryCardProps): React.JSX.Element {
  const { t } = useTranslation();
  const create = useCreateFixedFileFlow({
    folder,
    path: 'CLAUDE.md',
    content: memoryTemplate(),
    onCreated,
  });
  const existing = files.filter((file) => file.exists);

  return (
    <ArtifactCardShell
      headingId="project-memory-heading"
      title={t('engines.claude.project.memoryTitle')}
      isEmpty={existing.length === 0}
      emptyTitle={t('engines.claude.project.memoryEmptyTitle')}
      emptyBody={t('engines.claude.project.memoryEmptyBody')}
      emptyAction={
        <Button variant="outline" disabled={create.creating} onClick={create.create}>
          {t('engines.claude.project.memoryNewFile')}
        </Button>
      }
      tableCaption={t('engines.claude.project.memoryTableCaption')}
      columns={[
        t('engines.claude.project.memoryColumnPath'),
        t('engines.claude.project.memoryColumnOrigin'),
        t('engines.claude.project.memoryColumnState'),
      ]}
    >
      <tbody>
        {existing.map((file) => (
          <tr key={file.path} className="border-b border-border last:border-b-0">
            <td className="p-2 font-code">
              <ArtifactNameCell
                folder={folder}
                sourceFile={memoryFileWithinFolder(file.origin) ? file.path : null}
                label={file.path}
              />
            </td>
            <td className="p-2">{t(MEMORY_ORIGIN_KEYS[file.origin])}</td>
            <td className="p-2">
              {t(MEMORY_STATE_KEYS[loadedWordOf(file)])}
              {file.diverges && (
                <span role="img" aria-label={t('engines.claude.project.memoryDiverges')}>
                  {DIVERGES_MARK}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </ArtifactCardShell>
  );
}
