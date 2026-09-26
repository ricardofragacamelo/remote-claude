import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '@domain/shared';

/**
 * Random UUIDs — version 4, lowercase, hyphenated.
 *
 * Not the id of anything of ours: every entity here is named by a ULID. This one exists for the
 * one id somebody else dictates the format of — the conversation in Claude's store, which the SDK
 * requires to be a UUID.
 */
export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
