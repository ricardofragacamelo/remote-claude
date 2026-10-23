import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { DestructiveConfirmFooter } from '@/shared/components/DestructiveConfirmFooter';
import { DialogFrame } from '@/shared/components/DialogFrame';
import type { RemoveFlow } from '../hooks/useRemoveFlow';

export interface RemoveServerDialogProps {
  readonly flow: RemoveFlow;
}

/**
 * "Remove this server?" — destructive, for good, so the way out is the first button and takes the
 * focus: an `Enter` pressed out of habit removes nothing (S-135, the same discipline
 * `explorer`'s own `DeleteDialog` already has). A batch removes one request per server and says
 * which failed and why, on its own row — never collapsed into one message (S-134).
 */
export function RemoveServerDialog({ flow }: RemoveServerDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const keep = useRef<HTMLButtonElement>(null);
  const targets = flow.targets;
  const open = targets !== null;

  useEffect(() => {
    if (open) {
      keep.current?.focus();
    }
  }, [open]);

  const title =
    targets === null
      ? ''
      : targets.length === 1
        ? t('agentSettings.mcp.removeTitleOne', { name: targets[0]?.name ?? '' })
        : t('agentSettings.mcp.removeTitleMany', { count: targets.length });

  return (
    <DialogFrame
      open={open}
      onClose={flow.cancel}
      title={title}
      description={t('agentSettings.mcp.removeDescription')}
      footer={
        <DestructiveConfirmFooter
          keepRef={keep}
          pending={flow.pending}
          keepLabel={t('agentSettings.mcp.removeKeep')}
          confirmLabel={t('agentSettings.mcp.removeConfirm')}
          pendingLabel={t('agentSettings.mcp.removePending')}
          onCancel={flow.cancel}
          onConfirm={flow.confirm}
        />
      }
    >
      {targets !== null && targets.length > 1 && (
        <ul
          aria-label={t('agentSettings.mcp.removeListLabel')}
          className="flex flex-col gap-1 text-ui"
        >
          {targets.map((server) => (
            <li key={server.id}>{server.name}</li>
          ))}
        </ul>
      )}
    </DialogFrame>
  );
}
