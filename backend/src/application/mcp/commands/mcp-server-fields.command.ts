import type { McpServerIdentity } from '@domain/mcp';

/**
 * One secret field of a write (plan 13, B-19, S-71): omitted keeps whatever is already stored for
 * that name (an update only — nothing to keep on a create), `null` removes it, a string replaces it.
 * The API is write-only: a read never carries this shape, only {@link McpSecretField} with no
 * ambiguity left in it.
 */
export interface McpSecretFieldInput {
  readonly name: string;
  readonly value?: string | null | undefined;
}

/** The fields of a server, as a create or update proposes them — before the S-71 merge. */
export interface McpServerFieldsInput extends McpServerIdentity {
  readonly command?: string | null | undefined;
  readonly args?: readonly string[] | undefined;
  readonly env?: readonly McpSecretFieldInput[] | undefined;
  readonly url?: string | null | undefined;
  readonly headers?: readonly McpSecretFieldInput[] | undefined;
}
