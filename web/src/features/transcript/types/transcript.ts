import type { ConversationSummary } from '@/features/session';

/** A page of the conversations of one workspace, newest first, and the cursor of the next. */
export interface ConversationListPage {
  readonly conversations: readonly ConversationSummary[];

  /** Opaque, and `null` on the last page. */
  readonly nextCursor: string | null;
}
