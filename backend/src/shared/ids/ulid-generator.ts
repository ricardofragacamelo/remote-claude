import { ulid } from 'ulid';

import type { IdGenerator } from '@domain/shared';

/**
 * ULIDs.
 *
 * Sortable by creation time, which is what makes them readable in a log and useful as a frame id
 * without a second timestamp beside them.
 */
export class UlidGenerator implements IdGenerator {
  next(): string {
    return ulid();
  }
}
