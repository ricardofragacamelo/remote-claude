import type { ReactNode } from 'react';

import { FolderPicker } from '@/features/agent-settings';
import type { AgentSettingsLocation } from '@/features/agent-settings';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadStatus } from '@/shared/components/LoadStatus';
import type { AppError } from '@/shared/api/errors';

export interface FolderGatedSectionProps {
  readonly engine: string;
  readonly location: AgentSettingsLocation;
  onLocation(next: AgentSettingsLocation): void;
  readonly folder: string | undefined;
  readonly chooseFolderTitle: string;
  readonly chooseFolderBody: string;
  readonly isLoading: boolean;
  readonly loadingLabel: string;
  readonly error: AppError | null;
  onRetry(): void;
  /** Whether every read this section's body needs has settled, with no error. */
  readonly ready: boolean;
  readonly children: ReactNode;
}

/**
 * The shell "Skills" and "Project" both open with (plan 13, B-34, B-39): a folder picker, a nudge to
 * choose one when none is chosen yet, and the load status once one is — jscpd found the two sections
 * repeating this shell letter for letter, which is why it is a component here rather than two copies.
 */
export function FolderGatedSection({
  engine,
  location,
  onLocation,
  folder,
  chooseFolderTitle,
  chooseFolderBody,
  isLoading,
  loadingLabel,
  error,
  onRetry,
  ready,
  children,
}: FolderGatedSectionProps): React.JSX.Element {
  return (
    <>
      <FolderPicker engine={engine} location={location} onLocation={onLocation} />

      {folder === undefined ? (
        <EmptyState title={chooseFolderTitle} description={chooseFolderBody} />
      ) : (
        <>
          <LoadStatus
            rows={4}
            isLoading={isLoading}
            loadingLabel={loadingLabel}
            error={error}
            onRetry={onRetry}
          />
          {ready && children}
        </>
      )}
    </>
  );
}
