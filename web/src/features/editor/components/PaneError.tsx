import { ErrorState } from '@/shared/components/ErrorState';
import type { ErrorStateProps } from '@/shared/components/ErrorState';

export interface PaneErrorProps {
  readonly error: ErrorStateProps['error'];
  onRetry(): void;
}

/**
 * Why a pane shows nothing — the editor that did not load, a diff that could not be read — and "try
 * again".
 */
export function PaneError({ error, onRetry }: PaneErrorProps): React.JSX.Element {
  return (
    <div className="p-4">
      <ErrorState error={error} onRetry={onRetry} />
    </div>
  );
}
