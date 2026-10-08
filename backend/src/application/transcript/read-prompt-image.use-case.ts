import type { UserId } from '@domain/auth';
import { base64Size } from '@domain/shared';
import {
  PromptImageTooLargeError,
  PromptImageTypeUnsupportedError,
  TranscriptNotFoundError,
} from '@domain/transcript';
import type { ClaudeSessionId } from '@domain/transcript';
import type { TranscriptStore } from './ports/transcript-store.port';
import { readableTranscript } from './readable-transcript';
import type { TranscriptAudience } from './transcript-audience';

/**
 * The types the route serves — the raster images the Messages API reads. An SVG executes script in the
 * page that opens it, so it is never one (plan 22, D-10).
 */
export const SERVED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Which image of which conversation, for whom. */
export interface ReadPromptImageQuery {
  readonly userId: UserId;
  readonly sessionId: ClaudeSessionId;

  /** The `blockId` of the marker the client holds. */
  readonly blockId: string;
}

/** An image to serve: its type, its size and its bytes in base64. */
export interface ServedImage {
  readonly mediaType: string;
  readonly size: number;
  readonly data: string;
}

/**
 * The image a prompt of a conversation carried, opened on demand (plan 22, B-12, D-09).
 *
 * The same fence as every read of the history. Then the type, then the size — measured without decoding
 * — and only then is it handed to the edge: an image refused is never decoded at all.
 */
export class ReadPromptImageUseCase {
  constructor(
    private readonly store: TranscriptStore,
    private readonly audience: TranscriptAudience,
    private readonly maxBytes: number,
  ) {}

  /**
   * @throws {TranscriptNotFoundError} no such conversation for this caller, or no image by that id
   * @throws {PromptImageTypeUnsupportedError} a type the route does not serve
   * @throws {PromptImageTooLargeError} above the ceiling
   */
  async execute(query: ReadPromptImageQuery): Promise<ServedImage> {
    const session = await readableTranscript(
      this.store,
      this.audience,
      query.sessionId,
      query.userId,
    );
    const image = await this.store.promptImage(session, query.blockId);

    if (image === null) {
      throw new TranscriptNotFoundError(query.sessionId.value);
    }

    if (image.mediaType === null || !SERVED_IMAGE_TYPES.has(image.mediaType)) {
      throw new PromptImageTypeUnsupportedError(image.mediaType ?? 'unknown');
    }

    const size = base64Size(image.data);
    if (size > this.maxBytes) {
      throw new PromptImageTooLargeError(size, this.maxBytes);
    }

    return { mediaType: image.mediaType, size, data: image.data };
  }
}
