import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  FolderLimits,
  FolderVisit,
  OpenedFolder,
  WorkspaceFolderRepository,
} from '@application/workspace';
import type { UserId } from '@domain/auth';
import { decideOpening, recentBeyondLimit, reorderTabs, WorkspaceFolder } from '@domain/workspace';
import type { WorkspacePath } from '@domain/workspace';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import type { Database, Transaction } from '@infra/database/connection';
import { workspaceFolders } from '@infra/database/schema';
import { lockForTransaction } from '../advisory-lock';
import { runLogged } from '../query-logging';
import { toEntity, toRow } from './workspace-folder.mapper';

/**
 * `workspace_folders`, in PostgreSQL.
 *
 * The writes that decide against the user's other folders — opening against the ceiling of tabs,
 * reordering against the open set — run in one transaction behind an advisory lock on the user.
 * Without it two windows opening two folders at the same moment would both read seven tabs and
 * both open an eighth, and the ceiling would be a suggestion (plan 06, S-43, S-46). The lock is
 * transaction-scoped, so the commit or the rollback releases it and it never outlives the write.
 *
 * The decisions are the domain's; this class only makes them atomic.
 */
@Injectable()
export class DrizzleWorkspaceFolderRepository implements WorkspaceFolderRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async findByUser(userId: UserId): Promise<readonly WorkspaceFolder[]> {
    return this.foldersOf(this.context.db, userId);
  }

  async open(visit: FolderVisit, limits: FolderLimits): Promise<OpenedFolder> {
    return this.context.db.transaction(async (tx) => {
      const folders = await this.lockedFoldersOf(tx, visit.userId);
      const decision = decideOpening(folders, visit.path, limits.openFolders);
      const existing = folders.find((folder) => folder.path.equals(visit.path));
      const opened = WorkspaceFolder.restore({
        userId: visit.userId,
        path: visit.path,
        root: visit.root,
        lastOpenedAt: visit.at,
        pinned: existing?.pinned ?? false,
        tabPosition: decision.position,
      });
      const row = toRow(opened, this.context.clock.now());

      // The conflict target is the key, which is the identity of the record: a second opening of
      // the same folder moves an instant and never adds a row.
      await runLogged(
        this.context.logger,
        'workspaceFolder.open',
        tx
          .insert(workspaceFolders)
          .values(row)
          .onConflictDoUpdate({
            target: [workspaceFolders.userId, workspaceFolders.path],
            set: {
              rootPath: row.rootPath,
              lastOpenedAt: row.lastOpenedAt,
              tabPosition: row.tabPosition,
              updatedAt: row.updatedAt,
            },
          }),
      );

      const after = [...folders.filter((folder) => folder !== existing), opened];
      await this.trimRecent(
        tx,
        visit.userId,
        recentBeyondLimit(after, limits.recentFolders).map((folder) => folder.path),
      );

      return { folder: opened, created: !decision.alreadyOpen };
    });
  }

  async close(userId: UserId, path: WorkspacePath): Promise<void> {
    // A folder already off the recent list has nothing left once its tab closes, and the table
    // does not keep a row that is neither — so it goes, and the tab of the rest closes.
    await this.letGo(userId, path, {
      operation: 'workspaceFolder.close',
      gone: isNull(workspaceFolders.lastOpenedAt),
      changes: { tabPosition: null },
    });
  }

  async reorder(userId: UserId, paths: readonly WorkspacePath[]): Promise<void> {
    await this.context.db.transaction(async (tx) => {
      const positions = reorderTabs(await this.lockedFoldersOf(tx, userId), paths);
      const now = this.context.clock.now();

      for (const [path, position] of positions) {
        await runLogged(
          this.context.logger,
          'workspaceFolder.reorder',
          tx
            .update(workspaceFolders)
            .set({ tabPosition: position, updatedAt: now })
            .where(and(eq(workspaceFolders.userId, userId.value), eq(workspaceFolders.path, path))),
        );
      }
    });
  }

  async pin(userId: UserId, path: WorkspacePath, pinned: boolean): Promise<void> {
    await runLogged(
      this.context.logger,
      'workspaceFolder.pin',
      this.context.db
        .update(workspaceFolders)
        .set({ isPinned: pinned, updatedAt: this.context.clock.now() })
        .where(and(this.folder(userId, path), isNotNull(workspaceFolders.lastOpenedAt))),
    );
  }

  async forget(userId: UserId, path: WorkspacePath): Promise<void> {
    // A closed folder goes whole; an open one keeps its tab and leaves the recent list.
    await this.letGo(userId, path, {
      operation: 'workspaceFolder.forget',
      gone: isNull(workspaceFolders.tabPosition),
      changes: { lastOpenedAt: null, isPinned: false },
    });
  }

  /**
   * Lets go of one half of a folder's row — its tab, or its place on the recent list — in one
   * transaction: the row goes when nothing else is left of it (`gone`), and otherwise takes
   * `changes`. Closing and forgetting are this, each with its own half.
   */
  private async letGo(
    userId: UserId,
    path: WorkspacePath,
    half: {
      readonly operation: string;
      readonly gone: SQL;
      readonly changes: Partial<typeof workspaceFolders.$inferInsert>;
    },
  ): Promise<void> {
    await this.context.db.transaction(async (tx) => {
      await runLogged(
        this.context.logger,
        `${half.operation}.remove`,
        tx.delete(workspaceFolders).where(and(this.folder(userId, path), half.gone)),
      );
      await runLogged(
        this.context.logger,
        half.operation,
        tx
          .update(workspaceFolders)
          .set({ ...half.changes, updatedAt: this.context.clock.now() })
          .where(this.folder(userId, path)),
      );
    });
  }

  /** The folders of a user, read under the lock that serialises every decision about them. */
  private async lockedFoldersOf(tx: Transaction, userId: UserId): Promise<WorkspaceFolder[]> {
    await lockForTransaction(tx, this.context.logger, 'workspaceFolder.lock', [
      'workspace_folders',
      userId.value,
    ]);

    return this.foldersOf(tx, userId);
  }

  private async foldersOf(db: Database | Transaction, userId: UserId): Promise<WorkspaceFolder[]> {
    const rows = await runLogged(
      this.context.logger,
      'workspaceFolder.findByUser',
      db.select().from(workspaceFolders).where(eq(workspaceFolders.userId, userId.value)),
    );

    return rows.map(toEntity);
  }

  /** Lets go of the recent folders past the ceiling. */
  private async trimRecent(
    tx: Transaction,
    userId: UserId,
    paths: readonly WorkspacePath[],
  ): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    await runLogged(
      this.context.logger,
      'workspaceFolder.trimRecent',
      tx.delete(workspaceFolders).where(
        and(
          eq(workspaceFolders.userId, userId.value),
          inArray(
            workspaceFolders.path,
            paths.map((path) => path.value),
          ),
        ),
      ),
    );
  }

  private folder(userId: UserId, path: WorkspacePath) {
    return and(eq(workspaceFolders.userId, userId.value), eq(workspaceFolders.path, path.value));
  }
}
