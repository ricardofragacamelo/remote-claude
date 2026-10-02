import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { relativeTo } from '@/shared/lib/folder-path';
import { previewOf, PREVIEWED_TOOLS, writtenPath } from '../lib/edit-preview';
import type { EditPreview } from '../lib/edit-preview';
import { readDiskNow } from '../services/disk-preview.service';
import type { PermissionRequest } from '../types/permission';

/** What the card can show of the change it asks about. */
export type EditPreviewState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  /** The file is not in the folder of the tab: the files API would not read it. */
  | { readonly kind: 'outside' }
  | { readonly kind: 'unavailable'; readonly error: AppError }
  | { readonly kind: 'ready'; readonly preview: EditPreview; readonly at: number };

/**
 * The change a pending `Edit`, `MultiEdit` or `Write` would make, against the disk **now** (plan 08,
 * B-29) — computed here, without changing the question nor the app (D-03).
 *
 * The disk can change between the preview and the answer (R-06), so the preview says when it was
 * computed and is read again whenever the window gets the focus back (S-131).
 */
export function useEditPreview(
  request: PermissionRequest,
  folder: string | null,
): EditPreviewState {
  const absolute = writtenPath(request.input);
  const relative = folder === null || absolute === null ? null : relativeTo(folder, absolute);
  const previewed = PREVIEWED_TOOLS.has(request.toolName) && absolute !== null;

  const query = useQuery({
    queryKey: ['permission', 'preview', request.requestId, folder, relative],
    queryFn: () => readDiskNow(folder ?? '', relative ?? ''),
    enabled: previewed && relative !== null,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (!previewed || folder === null) {
    return { kind: 'none' };
  }

  if (relative === null) {
    return { kind: 'outside' };
  }

  if (query.error !== null) {
    return { kind: 'unavailable', error: query.error as AppError };
  }

  return query.data === undefined
    ? { kind: 'loading' }
    : {
        kind: 'ready',
        preview: previewOf(request.toolName, request.input, query.data),
        at: query.dataUpdatedAt,
      };
}
