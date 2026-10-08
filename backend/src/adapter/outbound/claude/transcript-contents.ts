import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import type { StoredImage } from '@application/transcript';
import { isPlainObject } from '@shared/utils/plain-object';
import { resultText } from './sdk-message.mapper';

/**
 * What the two routes of plan 22 serve, out of one read of a conversation: the whole output of each
 * tool, and each image a prompt carried (D-18).
 *
 * The cache of the conversation keeps only its **events**, with the summary cut — the content these
 * serve is what weighs in a transcript, and keeping every message raw for the sixteen conversations
 * cached would multiply the memory that cache exists to bound. So it is indexed apart, once per
 * version, and kept for fewer conversations.
 */
export interface TranscriptContents {
  /** The output of each tool of the main chain, as text, by `toolUseId`. */
  readonly results: ReadonlyMap<string, string>;

  /** Each image of a prompt of the main chain, by the `blockId` its marker carries. */
  readonly images: ReadonlyMap<string, StoredImage>;
}

/**
 * The contents of a conversation, from what `getSessionMessages` returned.
 *
 * Only the main chain: an entry of a subagent is read with the subagent, when its card is opened, and
 * a result of it is not one the route finds (S-28). The `blockId` is `<uuid>:<index>`, exactly as the
 * mapper names the marker the client holds.
 */
export function contentsOf(messages: readonly SessionMessage[]): TranscriptContents {
  const results = new Map<string, string>();
  const images = new Map<string, StoredImage>();

  for (const message of messages) {
    if (message.type !== 'user' || message.parent_tool_use_id !== null) {
      continue;
    }

    blocksOf(message).forEach((block, index) => {
      if (block['type'] === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        results.set(block['tool_use_id'], resultText(block['content']));
      }

      const image = imageOf(block);
      if (image !== null) {
        images.set(`${message.uuid}:${String(index)}`, image);
      }
    });
  }

  return { results, images };
}

/** The blocks of an entry; a content that is a string is one text block, as the mapper reads it. */
function blocksOf(message: SessionMessage): Record<string, unknown>[] {
  const content = isPlainObject(message.message) ? message.message['content'] : undefined;

  return Array.isArray(content) ? content.filter(isPlainObject) : [];
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
