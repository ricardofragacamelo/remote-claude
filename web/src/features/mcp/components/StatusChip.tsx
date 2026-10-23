import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { STATUS_KEYS } from '../lib/status-words';
import type { McpStatus } from '../types/mcp';

/** The tone of each status — colour is never the only way to tell them apart (the word is too). */
const TONE: Readonly<Record<McpStatus, string>> = {
  connected: 'bg-success/15 text-success',
  failed: 'bg-destructive/15 text-destructive',
  'needs-auth': 'bg-warning/15 text-warning',
  pending: 'bg-muted text-muted-foreground',
  disabled: 'bg-muted text-muted-foreground',
};

/** A server's status, as a small chip (S-131) — the same five words `sessions.mcp.*` already uses,
 * under this screen's own i18n prefix (a deliberate choice, not a duplication left by accident). */
export function StatusChip({ status }: { readonly status: McpStatus }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-ui-xs', TONE[status])}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}
