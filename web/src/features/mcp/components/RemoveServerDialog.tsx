import type { RemoveConfirmKeys } from '@/shared/components/RemoveConfirmDialog';
import { RemoveConfirmDialog } from '@/shared/components/RemoveConfirmDialog';
import type { RemoveFlow } from '../hooks/useRemoveFlow';

export interface RemoveServerDialogProps {
  readonly flow: RemoveFlow;
}

/** The i18n keys of this screen's own remove confirm — declared once, outside any JSX (see
 * `RemoveConfirmDialog`'s own doc for why). */
const KEYS: RemoveConfirmKeys = {
  titleOne: 'agentSettings.mcp.removeTitleOne',
  titleMany: 'agentSettings.mcp.removeTitleMany',
  description: 'agentSettings.mcp.removeDescription',
  keep: 'agentSettings.mcp.removeKeep',
  confirm: 'agentSettings.mcp.removeConfirm',
  pending: 'agentSettings.mcp.removePending',
  list: 'agentSettings.mcp.removeListLabel',
};

/**
 * "Remove this server?" — destructive, for good, so the way out is the first button and takes the
 * focus: an `Enter` pressed out of habit removes nothing (S-135, the same discipline
 * `explorer`'s own `DeleteDialog` already has). A batch removes one request per server and says
 * which failed and why, on its own row — never collapsed into one message (S-134).
 */
export function RemoveServerDialog({ flow }: RemoveServerDialogProps): React.JSX.Element {
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
