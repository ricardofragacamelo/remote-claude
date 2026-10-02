import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { IconButton } from '@/shared/components/IconButton';
import { useQueue } from '../../hooks/useQueue';

/** Who sent a queued prompt — named in full so the i18n check sees each key. */
const AUTHORS: Readonly<Record<string, string>> = {
  web: 'sessions.queue.fromWeb',
  mobile: 'sessions.queue.fromMobile',
};

/**
 * The prompts waiting for the turn to end, above the prompt box (plan 08, B-34): the same queue for
 * every client watching, each with its place, who sent it and the start of what it says — and the
 * way to take it out before it reaches Claude.
 */
export function QueueList({ sessionId }: { readonly sessionId: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const queue = useQueue(sessionId);

  if (queue.prompts.length === 0 && queue.refusal === null) {
    return null;
  }

  return (
    <section aria-label={t('sessions.queue.title')} className="flex flex-col gap-1">
      <p className="text-ui-xs text-muted-foreground">{t('sessions.queue.description')}</p>
      <ol className="flex flex-col gap-1">
        {queue.prompts.map((prompt, index) => (
          <li
            key={prompt.queueId}
            className="flex min-w-0 items-center gap-2 rounded border border-border px-2 py-1 text-ui-sm"
          >
            <span className="shrink-0 font-code text-ui-xs">
              {t('sessions.queue.position', { position: index + 1 })}
            </span>
            <span className="min-w-0 flex-1 truncate" title={prompt.preview}>
              {prompt.preview}
            </span>
            <span className="shrink-0 text-ui-xs text-muted-foreground">
              {t(AUTHORS[prompt.promptedBy] ?? 'sessions.queue.fromOther')}
            </span>
            <IconButton
              icon={X}
              label={t('sessions.queue.cancel', { position: index + 1 })}
              onClick={() => {
                queue.cancel(prompt.queueId);
              }}
            />
          </li>
        ))}
      </ol>
      {queue.refusal !== null && <ErrorState error={queue.refusal} />}
    </section>
  );
}
