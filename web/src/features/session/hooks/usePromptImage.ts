import { useMemo } from 'react';

import { newTraceId } from '@/shared/lib/trace';
import { useObjectUrl } from '@/shared/hooks/useObjectUrl';
import type { ObjectUrl } from '@/shared/hooks/useObjectUrl';
import { asAppError } from '../lib/app-errors';
import { fetchPromptImage } from '../services/transcript-content.service';

/** An image of a prompt, as a `blob:` URL the page made itself — or why there is none. */
export type PromptImage = ObjectUrl;

/**
 * The image a prompt carried, fetched when the person opens it (plan 22, B-30) with the credential in
 * the header, and shown by a `blob:` URL the page made — the token is never in a URL (D-10, S-122).
 * Nothing is read until it is opened (`blockId` `null`), and the `blob:` is revoked when it closes,
 * so the bytes do not outlive the dialog (S-119); a read still on its way is aborted.
 *
 * @param blockId the image open now — `null` while none is
 */
export function usePromptImage(conversationId: string | null, blockId: string | null): PromptImage {
  const source = useMemo(
    () =>
      conversationId === null || blockId === null
        ? null
        : {
            read: (signal: AbortSignal) => fetchPromptImage(conversationId, blockId, signal),
            failure: (error: unknown) => asAppError(error, newTraceId()),
          },
    [conversationId, blockId],
  );

  return useObjectUrl([conversationId ?? '', blockId ?? ''], source);
}
