import { useTranslation } from 'react-i18next';

import type { ProjectHookView } from '../types/project-config';
import { ArtifactCardShell } from './ArtifactCardShell';

export interface HooksCardProps {
  readonly hooks: readonly ProjectHookView[];
}

/**
 * The project's own hooks, read-only (plan 13, B-38, D-17): event, matcher and the exact command,
 * spelled out — never run by this screen, only shown, because a hook's command is arbitrary code
 * that runs on this machine on its own event, with nobody approving it here (R-03, open risk).
 */
export function HooksCard({ hooks }: HooksCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ArtifactCardShell
      headingId="project-hooks-heading"
      title={t('engines.claude.project.hooksTitle')}
      isEmpty={hooks.length === 0}
      emptyTitle={t('engines.claude.project.hooksEmptyTitle')}
      emptyBody={t('engines.claude.project.hooksEmptyBody')}
      beforeTable={
        <p role="alert" className="text-ui-xs text-destructive">
          {t('engines.claude.project.hooksWarning')}
        </p>
      }
      tableCaption={t('engines.claude.project.hooksTableCaption')}
      columns={[
        t('engines.claude.project.hooksColumnEvent'),
        t('engines.claude.project.hooksColumnMatcher'),
        t('engines.claude.project.hooksColumnCommand'),
      ]}
    >
      <tbody>
        {hooks.map((hook, index) => (
          <tr
            // No field of a hook is unique on its own — the same event/matcher/command can
            // legitimately repeat across entries of `settings.json`; the index is this row's only
            // stable identity, and the list is never reordered under the user's feet.
            key={index}
            className="border-b border-border last:border-b-0"
          >
            <td className="p-2">{hook.event}</td>
            <td className="p-2">{hook.matcher ?? '—'}</td>
            <td className="p-2 font-code text-ui-xs">{hook.command}</td>
          </tr>
        ))}
      </tbody>
    </ArtifactCardShell>
  );
}
