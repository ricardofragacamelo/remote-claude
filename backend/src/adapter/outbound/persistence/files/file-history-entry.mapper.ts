import { UserId } from '@domain/auth';
import type { HistoryEntry, HistoryEntryKind, HistoryKept, HistoryReason } from '@domain/files';
import type { fileHistoryEntries } from '@infra/database/schema';

type EntryRow = typeof fileHistoryEntries.$inferSelect;

/**
 * A row as the domain reads it. The CHECKs of the table are what make the casts honest: a row with
 * a kind, a reason or a `kept` this build does not know cannot be written in the first place.
 */
export function toEntity(row: EntryRow): HistoryEntry {
  return {
    id: row.id,
    seq: row.seq,
    userId: UserId.create(row.userId),
    path: row.path,
    label: row.label,
    entryKind: row.entryKind as HistoryEntryKind,
    hash: row.hash,
    sizeBytes: row.sizeBytes,
    reason: row.reason as HistoryReason,
    kept: row.kept as HistoryKept,
    batchId: row.batchId,
    createdAt: row.createdAt,
  };
}
