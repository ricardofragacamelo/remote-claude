import type { RemoveConfirmKeys } from '@/shared/components/RemoveConfirmDialog';
import { RemoveConfirmDialog } from '@/shared/components/RemoveConfirmDialog';
import type { RemovePluginFlow } from '../hooks/useRemovePluginFlow';

export interface RemovePluginDialogProps {
  readonly flow: RemovePluginFlow;
}

/** The i18n keys of this screen's own remove confirm — declared once, outside any JSX (see
 * `RemoveConfirmDialog`'s own doc for why). */
const KEYS: RemoveConfirmKeys = {
  titleOne: 'engines.claude.plugins.removeTitleOne',
  titleMany: 'engines.claude.plugins.removeTitleMany',
  description: 'engines.claude.plugins.removeDescription',
  keep: 'engines.claude.plugins.removeKeep',
  confirm: 'engines.claude.plugins.removeConfirm',
  pending: 'engines.claude.plugins.removePending',
  list: 'engines.claude.plugins.removeListLabel',
};

/**
 * "Remove this plugin?" — destructive, for good, the way out first and focused on open (S-135's same
 * discipline, built on the shared `RemoveConfirmDialog` that `mcp`'s own `RemoveServerDialog` also
 * uses). A batch removes one request per plugin and reports each outcome on its own.
 */
export function RemovePluginDialog({ flow }: RemovePluginDialogProps): React.JSX.Element {
  return (
    <RemoveConfirmDialog
      targets={flow.targets}
      pending={flow.pending}
      keys={KEYS}
      onCancel={flow.cancel}
      onConfirm={flow.confirm}
    />
  );
}
