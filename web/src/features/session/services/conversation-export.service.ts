import { logger } from '@/shared/logging/logger';
import { conversationMarkdown } from '../lib/conversation-markdown';
import type { MarkdownLabels, MarkdownOptions } from '../lib/conversation-markdown';
import type { HistoryEvent } from '../types/history';
import { conversationFrom } from './conversation-reducer';
import { fetchHistoryPage } from './history.service';

/**
 * A whole conversation as Markdown (plan 08, B-39, D-20): every page of its transcript — the history
 * reads the newest first, the export lays them oldest first — through the reducer the screen reads
 * them with, so the export says what the person could read and nothing else.
 *
 * @param onPage told how many pages arrived so far, before each one is asked for
 * @throws {import('@/shared/api/errors').AppError} of the page that failed — nothing is written of
 *   half a conversation (S-182)
 */
export async function exportConversation(
  conversationId: string,
  labels: MarkdownLabels,
  options: MarkdownOptions,
  onPage: (pages: number) => void,
): Promise<string> {
  const pages: (readonly HistoryEvent[])[] = [];
  let cursor: string | null = null;

  do {
    onPage(pages.length);
    const page = await fetchHistoryPage(conversationId, cursor);
    pages.unshift(page.events);
    cursor = page.nextCursor;
  } while (cursor !== null);

  const markdown = conversationMarkdown(conversationFrom(pages.flat()), labels, options);
  logger.debug(
    {
      op: 'session.export',
      conversationId,
      pages: pages.length,
      outputs: options.outputs,
      length: markdown.length,
    },
    'conversation exported',
  );
  return markdown;
}
