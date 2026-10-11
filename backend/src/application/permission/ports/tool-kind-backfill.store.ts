/** The two records of a call that keep its kind beside the engine's name of the tool. */
export const INVOCATION_TABLES = ['auditEntries', 'permissionRequests'] as const;

export type InvocationTable = (typeof INVOCATION_TABLES)[number];

/** A record of a call written before its kind was kept. */
export interface UntaggedInvocation {
  readonly id: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** The kind given to one record. */
export interface InvocationKind {
  readonly id: string;
  readonly kind: string;
}

/**
 * Where the records of a call written before the core kept its kind get it, once (plan 28, B-33).
 * Only a record with no kind is ever written, so a second pass changes nothing (S-98).
 */
export interface ToolKindBackfillStore {
  /** Up to [limit] records of [table] with no kind, by id, after [afterId] (`null` from the start). */
  untagged(
    table: InvocationTable,
    afterId: string | null,
    limit: number,
  ): Promise<UntaggedInvocation[]>;

  /** Gives each record its kind, if it still has none. @returns how many were written */
  tag(table: InvocationTable, kinds: readonly InvocationKind[]): Promise<number>;
}

export const TOOL_KIND_BACKFILL_STORE = Symbol('ToolKindBackfillStore');
