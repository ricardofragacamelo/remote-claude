import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { AppError } from '@/shared/api/errors';

export interface ErrorStateProps {
  readonly error: AppError;
  readonly onRetry?: () => void;
}

/**
 * The error state of a screen.
 *
 * It shows the translated message and the **trace**, which is what turns "it broke" into a report
 * somebody can find in the log. It reacts to `error.code`, never to an HTTP status — the status
 * stopped existing at `api.ts`.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive p-6"
    >
      <p className="text-sm text-destructive">{t(error.messageKey, error.params)}</p>
      <p className="font-mono text-xs text-muted-foreground">
        {t('common.error.traceLabel', { traceId: error.traceId })}
      </p>
      {onRetry !== undefined && (
        <Button variant="outline" onClick={onRetry}>
          {t('common.action.retry')}
        </Button>
      )}
    </div>
  );
}
