import { useTranslation } from 'react-i18next';

import { PERMISSION_KIND_KEYS } from '../lib/project-status-words';
import type { ProjectPermissionView } from '../types/project-config';
import { ArtifactCardShell } from './ArtifactCardShell';

export interface PermissionsCardProps {
  readonly permissions: readonly ProjectPermissionView[];
}

/**
 * The project's own permission rules, read-only (plan 13, B-38, D-17): `deny` applies in this
 * product's sessions; `allow` is described as having no effect here, because the backend clears the
 * folder's trust mark before a session opens — the same `allow` would run without asking in the
 * terminal's own Claude Code, which this card says explicitly rather than leaving as a silent gap.
 */
export function PermissionsCard({ permissions }: PermissionsCardProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ArtifactCardShell
      headingId="project-permissions-heading"
      title={t('engines.claude.project.permissionsTitle')}
      isEmpty={permissions.length === 0}
      emptyTitle={t('engines.claude.project.permissionsEmptyTitle')}
      emptyBody={t('engines.claude.project.permissionsEmptyBody')}
      tableCaption={t('engines.claude.project.permissionsTableCaption')}
      columns={[
        t('engines.claude.project.permissionsColumnRule'),
        t('engines.claude.project.permissionsColumnKind'),
        t('engines.claude.project.permissionsColumnState'),
      ]}
    >
      <tbody>
        {permissions.map((permission, index) => (
          <tr key={index} className="border-b border-border last:border-b-0">
            <td className="p-2 font-code text-ui-xs">{permission.rule}</td>
            <td className="p-2">{t(PERMISSION_KIND_KEYS[permission.kind])}</td>
            <td className="p-2">
              {t(
                permission.appliesHere
                  ? 'engines.claude.project.permissionsApplied'
                  : 'engines.claude.project.permissionsNoEffect',
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </ArtifactCardShell>
  );
}
