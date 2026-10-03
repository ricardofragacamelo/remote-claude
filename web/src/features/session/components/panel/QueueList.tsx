import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { useQueue } from '../../hooks/useQueue';
import { RefusalStrip } from '../composer/RefusalStrip';

/** Who sent a queued prompt — named in full so the i18n check sees each key. */
const AUTHORS: Readonly<Record<string, string>> = {
  web: 'sessions.queue.fromWeb',
  mobile: 'sessions.queue.fromMobile',
};

/**
 * The prompts waiting for the turn to end, above the prompt box (plan 08, B-34): the same queue for
 * every client watching, each with its place, who sent it and the start of what it says — and the
 * way to take it out before it reaches Claude. One compact line each (plan 09, B-14).
 */
export function QueueList({ sessionId }: { readonly sessionId: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const queue = useQueue(sessionId);

  if (queue.prompts.length === 0 && queue.refusal === null) {
    return null;
  }

  return (
    <section aria-label={t('sessions.queue.title')} className="flex flex-col gap-0.5">
      <p className="sr-only">{t('sessions.queue.description')}</p>
      <ol className="flex flex-col gap-0.5" title={t('sessions.queue.description')}>
        {queue.prompts.map((prompt, index) => (
          <li
            key={prompt.queueId}
            className="flex min-w-0 items-center gap-2 rounded bg-muted px-2 text-ui-xs"
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
              className="md:size-6"
              label={t('sessions.queue.cancel', { position: index + 1 })}
              onClick={() => {
                queue.cancel(prompt.queueId);
              }}
            />
          </li>
        ))}
      </ol>
      {queue.refusal !== null && <RefusalStrip error={queue.refusal} />}
    </section>
  );
}
