import type {
  NotificationHistoryRepository,
  NotificationPage,
  RecordedNotification,
} from '@application/notification';
import type { UserId } from '@domain/auth';
import { NotificationEntry } from '@domain/notification';

/**
 * The notification history, in an array, newest last — with the same answers as the table: one
 * entry per client id, the oldest going past the ceiling, and every call scoped by its user.
 */
export class InMemoryNotificationHistoryRepository implements NotificationHistoryRepository {
  readonly entries: NotificationEntry[] = [];

  record(entry: NotificationEntry, limit: number): Promise<RecordedNotification> {
    const existing = this.entries.find(
      (candidate) => candidate.userId.equals(entry.userId) && candidate.clientId === entry.clientId,
    );

    if (existing !== undefined) {
      return Promise.resolve({ entry: existing, created: false });
    }

    this.entries.push(entry);

    const mine = this.of(entry.userId);
    for (const gone of mine.slice(0, Math.max(0, mine.length - limit))) {
      this.entries.splice(this.entries.indexOf(gone), 1);
    }

    return Promise.resolve({ entry, created: true });
  }

  page(userId: UserId, cursor: string | null, size: number): Promise<NotificationPage> {
    const newest = [...this.of(userId)].reverse();
    const start = cursor === null ? 0 : Number(cursor);
    const shown = newest.slice(start, start + size);

    return Promise.resolve({
      entries: shown,
      nextCursor: start + size < newest.length ? String(start + size) : null,
      unread: newest.filter((entry) => entry.readAt === null).length,
    });
  }

  markRead(userId: UserId, ids: readonly string[], at: Date): Promise<void> {
    this.replace(userId, (entry) => ids.includes(entry.id) && entry.readAt === null, at);
    return Promise.resolve();
  }

  markAllRead(userId: UserId, at: Date): Promise<void> {
    this.replace(userId, (entry) => entry.readAt === null, at);
    return Promise.resolve();
  }

  remove(userId: UserId, id: string): Promise<void> {
    this.drop((entry) => entry.userId.equals(userId) && entry.id === id);
    return Promise.resolve();
  }

  clear(userId: UserId): Promise<void> {
    this.drop((entry) => entry.userId.equals(userId));
    return Promise.resolve();
  }

  purgeCreatedBefore(cutoff: Date): Promise<number> {
    const before = this.entries.length;
    this.drop((entry) => entry.createdAt < cutoff);
    return Promise.resolve(before - this.entries.length);
  }

  private of(userId: UserId): NotificationEntry[] {
    return this.entries.filter((entry) => entry.userId.equals(userId));
  }

  private replace(userId: UserId, matches: (entry: NotificationEntry) => boolean, at: Date): void {
    this.entries.forEach((entry, index) => {
      if (entry.userId.equals(userId) && matches(entry)) {
        this.entries[index] = NotificationEntry.restore({ ...entry.snapshot(), readAt: at });
      }
    });
  }

  private drop(matches: (entry: NotificationEntry) => boolean): void {
    for (const entry of this.entries.filter(matches)) {
      this.entries.splice(this.entries.indexOf(entry), 1);
    }
  }
}
