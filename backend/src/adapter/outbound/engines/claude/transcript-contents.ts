import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import type { StoredImage } from '@application/transcript';
import { isPlainObject } from '@shared/utils/plain-object';
import { resultText } from './sdk-message.mapper';

/**
 * What the two routes of plan 22 serve, out of one read of a conversation: the whole output of each
 * tool, and each image a prompt carried (D-18) — plus, since plan 27 · B-14, an image nested inside a
 * tool's own result.
 *
 * The cache of the conversation keeps only its **events**, with the summary cut — the content these
 * serve is what weighs in a transcript, and keeping every message raw for the sixteen conversations
 * cached would multiply the memory that cache exists to bound. So it is indexed apart, once per
 * version, and kept for fewer conversations.
 */
export interface TranscriptContents {
  /** The output of each tool of the main chain, as text, by `toolUseId`. */
  readonly results: ReadonlyMap<string, string>;

  /**
   * Every image of the main chain, by the `blockId` its marker carries — `<uuid>:<index>` for a
   * prompt's own image, `<uuid>:<index>:<subIndex>` for one nested inside a `tool_result` (B-14).
   */
  readonly images: ReadonlyMap<string, StoredImage>;
}

/**
 * The contents of a conversation, from what `getSessionMessages` returned.
 *
 * Only the main chain: an entry of a subagent is read with the subagent, when its card is opened, and
 * a result of it is not one the route finds (S-28) — an image nested in one is, though, down
 * {@link imagesOf} (B-15). The `blockId` is exactly as the mapper names the marker the client holds.
 */
export function contentsOf(messages: readonly SessionMessage[]): TranscriptContents {
  const results = new Map<string, string>();
  const images = new Map<string, StoredImage>();

  for (const message of messages) {
    if (message.type !== 'user' || message.parent_tool_use_id !== null) {
      continue;
    }

    blocksOf(message).forEach((block) => {
      if (block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        results.set(block['tool_use_id'], resultText(block['content']));
      }
    });

    indexImages(message, images);
  }

  return { results, images };
}

/**
 * The images of a subagent's own messages, by the same `blockId` scheme as {@link contentsOf} — asked
 * for only once the main chain's images did not have the one the route was given (B-15, S-59).
 */
export function imagesOf(messages: readonly SessionMessage[]): ReadonlyMap<string, StoredImage> {
  const images = new Map<string, StoredImage>();

  for (const message of messages) {
    if (message.type === 'user') {
      indexImages(message, images);
    }
  }

  return images;
}

/** Every image of one message, top-level and nested inside a `tool_result` (B-14), by its `blockId`. */
function indexImages(message: SessionMessage, images: Map<string, StoredImage>): void {
  blocksOf(message).forEach((block, index) => {
    const image = imageOf(block);
    if (image !== null) {
      images.set(`${message.uuid}:${String(index)}`, image);
    }

    if (block['type'] === 'tool_result') {
      innerBlocksOf(block).forEach((inner, innerIndex) => {
        const nested = imageOf(inner);
        if (nested !== null) {
          images.set(`${message.uuid}:${String(index)}:${String(innerIndex)}`, nested);
        }
      });
    }
  });
}

/** The blocks of an array the SDK gave as unknown content — a plain array, filtered to objects. */
function blockArray(content: unknown): Record<string, unknown>[] {
  return Array.isArray(content) ? content.filter(isPlainObject) : [];
}

/** The blocks of an entry; a content that is a string is one text block, as the mapper reads it. */
function blocksOf(message: SessionMessage): Record<string, unknown>[] {
  const content = isPlainObject(message.message) ? message.message['content'] : undefined;

  return blockArray(content);
}

/** The blocks of a `tool_result`'s own content — the same shape as a message's (B-14). */
function innerBlocksOf(block: Record<string, unknown>): Record<string, unknown>[] {
  return blockArray(block['content']);
}

/** An image block with its bytes, or `null` — an image given by URL has no bytes here to serve. */
function imageOf(block: Record<string, unknown>): StoredImage | null {
  const source = block['source'];

  if (block['type'] !== 'image' || !isPlainObject(source) || source['type'] !== 'base64') {
    return null;
  }

  const data = source['data'];
  const mediaType = source['media_type'];

  return typeof data === 'string'
    ? { mediaType: typeof mediaType === 'string' && mediaType !== '' ? mediaType : null, data }
    : null;
}
