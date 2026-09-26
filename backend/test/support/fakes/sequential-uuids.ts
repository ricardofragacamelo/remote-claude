import type { IdGenerator } from '@domain/shared';

/**
 * Canonical UUIDs, in a predictable order — for the one id whose format the SDK dictates.
 *
 * `00000000-0000-4000-8000-000000000001`, then `…002`: valid, lowercase, and nameable in an
 * assertion.
 */
export class SequentialUuids implements IdGenerator {
  private issued = 0;

  next(): string {
    this.issued += 1;
    return `00000000-0000-4000-8000-${this.issued.toString().padStart(12, '0')}`;
  }
}
