import type { UserId } from '@domain/auth';
import { liveSessionsIn } from '@domain/session';
import type { Session } from '@domain/session';
import type { FolderLocator } from './ports/folder-locator.port';
import type { PendingPermissions } from './ports/pending-permissions.port';
import type { SessionConversation } from './ports/claude-session.port';
import type { SessionRegistry } from './session-registry';

/** One live session of a folder, as the list of the workbench shows it. */
export interface LiveSessionListing {
  readonly session: Session;
  readonly conversation: SessionConversation;

  /** How many questions it is holding its loop open for — a person is being waited on. */
  readonly pendingPermissions: number;
}

/**
 * The sessions of the caller running in a folder or below it — plan 08, B-07.
 *
 * The folder goes through the same gate opening a session does, with the same refusals in the same
 * order, before the registry is looked at: a path outside the caller's roots costs nothing and says
 * nothing about what runs there. Then the pure rule decides — the caller's own, inside the folder by
 * real path and by segment ({@link liveSessionsIn}).
 */
export class ListLiveSessionsUseCase {
  constructor(
    private readonly folders: FolderLocator,
    private readonly registry: SessionRegistry,
    private readonly pending: PendingPermissions,
  ) {}

  /** @throws whatever {@link FolderLocator.locate} refuses the folder with */
  async execute(workspacePath: string, userId: UserId): Promise<readonly LiveSessionListing[]> {
    const folder = await this.folders.locate(workspacePath, userId);
    const listed = this.registry.listed();
    const conversations = new Map(
      listed.map((entry) => [entry.session.id.value, entry.conversation]),
    );

    return liveSessionsIn(
      folder,
      listed.map((entry) => entry.session),
      userId,
    ).map((session) => ({
      session,
      // Known to be there: every listed session came with its conversation.
      conversation: conversations.get(session.id.value) as SessionConversation,
      pendingPermissions: this.pending.countFor(session.id),
    }));
  }
}
