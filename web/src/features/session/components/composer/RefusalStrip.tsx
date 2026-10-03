import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { ErrorStateProps } from '@/shared/components/ErrorState';
import { IconButton } from '@/shared/components/IconButton';
import { StateStrip } from '../frame/StateStrip';

/**
 * Why the last send was refused, above the box (plan 09, B-14): one line, translated, with the trace
 * that finds it in the logs — and closed by a click, the text and the context staying in the box. The
 * next refusal is a new strip, open again.
 */
export function RefusalStrip({
  error,
}: {
  readonly error: ErrorStateProps['error'];
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [closed, setClosed] = useState<object | null>(null);

  if (closed === error) {
    return null;
  }

  return (
    <StateStrip
      role="alert"
      action={
        <IconButton
          icon={X}
          label={t('composer.refusal.close')}
          className="md:size-6"
          onClick={() => {
            setClosed(error);
          }}
        />
      }
    >
      {t(error.messageKey, error.params)}{' '}
      <span className="font-mono text-muted-foreground">
        {t('common.error.traceLabel', { traceId: error.traceId })}
      </span>
    </StateStrip>
  );
}
