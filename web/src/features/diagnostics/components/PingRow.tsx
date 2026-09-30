import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/shared/components/ui/skeleton';
import type { PingRequest } from '../types/ping';

/** One ping: waiting for its answer, or the answer and the round trip. */
export function PingRow({ request }: { readonly request: PingRequest }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { pong, answeredAt } = request;

  if (pong === null || answeredAt === null) {
    return (
      <li className="rounded-lg border border-border p-3">
        <Skeleton className="h-10 w-full" aria-label={t('diagnostics.ping.pending')} />
      </li>
    );
  }

  const at = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' }).format(
    new Date(pong.pingedAt),
  );

  return (
    <li className="flex flex-col gap-0.5 rounded-lg border border-border p-3 text-ui">
      <p>{t('diagnostics.ping.result', { count: pong.pingCount, at })}</p>
      <p className="text-muted-foreground">
        {t('diagnostics.ping.roundTrip', { ms: Math.max(0, answeredAt - request.sentAt) })}
      </p>
      <p className="font-code text-ui-sm text-muted-foreground">
        {t('diagnostics.ping.sequence', { seq: pong.seq })}
      </p>
    </li>
  );
}
