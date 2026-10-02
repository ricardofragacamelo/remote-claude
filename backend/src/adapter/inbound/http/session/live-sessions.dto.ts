import { z } from 'zod';

import type { LiveSessionListing } from '@application/session';

/**
 * What `GET /sessions` may be asked: one folder.
 *
 * Format only, as everywhere at this edge — whether the folder may be reached is the allowlist's
 * question, answered in the use case. The path travels as a query parameter, like
 * `GET /transcripts`: a proxy that normalises `%2F` in a URL segment would change the value the
 * allowlist is about to check.
 */
export const listLiveSessionsSchema = z.object({
  workspacePath: z.string().min(1).max(4096),
});

export type ListLiveSessionsQueryDto = z.infer<typeof listLiveSessionsSchema>;

/** One live session, as the view of the workbench shows it. */
export interface LiveSessionDto {
  readonly sessionId: string;

  /** The conversation in Claude's store — what the history lists, and a resume names. */
  readonly claudeSessionId: string;

  /** The conversation it continues, when it is a resume; `null` for a new one. */
  readonly resumedFrom: string | null;

  /** Where it runs — the folder asked about, or one below it. */
  readonly workspacePath: string;
  readonly status: string;
  readonly model: string;
  readonly permissionMode: string;
  readonly startedAt: string;
  readonly openedFrom: string;
  readonly pendingPermissions: number;
}

/** The answer: a list, possibly empty — an empty folder is an answer too. */
export interface LiveSessionListDto {
  readonly sessions: readonly LiveSessionDto[];
}

/** The transport shape of the live sessions of a folder. */
export function toLiveSessionListDto(listings: readonly LiveSessionListing[]): LiveSessionListDto {
  return {
    sessions: listings.map(({ session, conversation, pendingPermissions }) => ({
      sessionId: session.id.value,
      claudeSessionId: conversation.claudeSessionId.value,
      resumedFrom: conversation.resumedFrom?.value ?? null,
      workspacePath: session.workspace.value,
      status: session.status,
      model: session.model,
      permissionMode: session.permissionMode,
      startedAt: session.openedAt.toISOString(),
      openedFrom: session.openedFrom,
      pendingPermissions,
    })),
  };
}
