import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import { useConnection } from '../hooks/useConnection';

/**
 * Where the socket of the app stands — the one connection every screen shares — and the way to try
 * again now instead of waiting out the backoff (plan 06, S-200).
 *
 * With the socket up there is no button: nothing to reconnect. Held back by the server, the button
 * is there but waits, and the screen says why — a button that silently did nothing would be read as
 * broken.
 */
export function ConnectionPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { status, canReconnect, heldBack, reconnect } = useConnection();

  return (
    <Panel
      title={t('diagnostics.connection.title')}
      description={t('diagnostics.connection.description')}
    >
      <p role="status" className="text-ui">
        {t(`connection.status.${status}`)}
      </p>

      {(canReconnect || heldBack) && (
        <div className="flex flex-col items-start gap-2">
          <Button variant="outline" size="touch" disabled={heldBack} onClick={reconnect}>
            <RefreshCw className="size-4" aria-hidden />
            {t('diagnostics.connection.reconnect')}
          </Button>
          {heldBack && (
            <p className="text-ui-sm text-muted-foreground">
              {t('diagnostics.connection.heldBack')}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
